import { Client } from "@notionhq/client";

import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import * as dotenv from "dotenv";

dayjs.extend(utc);
dayjs.extend(timezone);

const KST = "Asia/Seoul";

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.TIL_NOTION_DATABASE_ID;
const slackWebhookUrl = process.env.TIL_SLACK_WEBHOOK_URL;
const restDatabaseId = process.env.TIL_REST_DATABASE_ID;

// 미리 등록된 유저 리스트
const registeredUsers = {
  "kill5038@gmail.com": "U07C2RS4VRT", // 길상혁(상혁)님
  "itoodo12@gmail.com": "U07BY0KMU69", // 손수민(수민)님
  "su10jin11@khu.ac.kr": "U07C19GL9V1", // 김수진(수진)님
  "hajuny129@gmail.com": "U05FAS0GB99", // 유하준(하준)님
  "jun020216@sookmyung.ac.kr": "U07C0N85M2P", // 박예준(예준)님
  "chaos296@cau.ac.kr": "U07C0TFGV4J", // 김보겸(Bo keum Kim)님
  "sookidayo@gmail.com": "U0969CSFCNM", // 지현숙(sook)님
};

function getTargetDateStr(): string {
  // cron은 UTC 18:00 (KST 익일 03:00)에 돌며, 마감일은 항상 KST 기준 "어제"입니다.
  // GitHub Actions가 수 시간 지연돼도(예: KST 05시 이후 실행) 같은 KST 날 안이면
  // "어제"는 변하지 않으므로, KST 현재 시각에서 명시적으로 하루를 뺍니다.
  return dayjs().tz(KST).subtract(1, "day").format("YYYY-MM-DD");
}

// Notion people 항목에서 이메일을 뽑는다.
// 일부 항목은 person이 펼쳐지지 않고 id만 오는 경우가 있어(게스트/외부 유저 등),
// person.email이 없으면 users.retrieve(id)로 이메일을 보강한다. 끝내 못 구하면 버린다.
// (옵셔널 체이닝만 하면 크래시는 막지만 미펼침 휴식자가 그냥 버려져 벌금 대상이 되는
//  부작용이 있어, 백필로 실제 이메일까지 복구한다.)
async function resolveEmails(people: any[] | undefined): Promise<string[]> {
  const emails = await Promise.all(
    (people || []).map(async (u: any) => {
      if (u.person?.email) return u.person.email;
      try {
        const full: any = await notion.users.retrieve({ user_id: u.id });
        return full.person?.email;
      } catch {
        return undefined;
      }
    }),
  );
  return emails.filter((e): e is string => Boolean(e));
}

async function getYesterdayEntries() {
  const targetDateStr = getTargetDateStr();

  // 타임존 이슈를 피하기 위해 Notion에서는 넉넉히 최근 이틀치 데이터를 모두 가져옵니다.
  const fetchStartDateStr = dayjs()
    .tz(KST)
    .subtract(2, "day")
    .format("YYYY-MM-DD");

  // 새 DB에는 수동 "날짜" 필드가 없어 자동 "생성 일시"(created_time)로 판단한다.
  const response = await notion.databases.query({
    database_id: databaseId!,
    filter: {
      timestamp: "created_time",
      created_time: {
        on_or_after: fetchStartDateStr,
      },
    },
  });

  // 자바스크립트 단에서 실제 Target Date와 대조하여 정확하게 필터링
  const filteredResults = response.results.filter((page: any) => {
    // created_time은 UTC ISO8601(예: 2026-07-01T05:00:00.000Z)이므로 KST 날짜로 변환해 비교.
    const pageDateStr = page.created_time;
    if (!pageDateStr) return false;
    return dayjs(pageDateStr).tz(KST).format("YYYY-MM-DD") === targetDateStr;
  });

  return Promise.all(
    filteredResults.map(async (page: any) => ({
      id: page.id,
      user: await resolveEmails(page.properties.사람?.people),
      categories:
        page.properties.태그?.multi_select?.map((tag: any) => tag.name) || [],
    })),
  );
}

async function getRestUsers() {
  const targetDateStr = getTargetDateStr();

  const response = await notion.databases.query({
    database_id: restDatabaseId!,
    filter: {
      property: "이때까지 쉴래요",
      date: {
        on_or_after: targetDateStr,
      },
    },
  });

  return Promise.all(
    response.results.map(async (page: any) => ({
      // 휴식 DB에는 person이 해석되지 않는 항목이 다수 존재(알람 미발송의 근본 원인이었음).
      // resolveEmails로 users.retrieve 백필까지 해서 휴식자를 정확히 인식한다.
      email: await resolveEmails(page.properties.사람?.people),
    })),
  );
}

async function notifySlack(missingUsers: string[]) {
  if (missingUsers.length === 0) return;

  const message = `🚨 안쓰고 뭐하셨어요! : ${missingUsers.join(", ")}님!`;
  console.log(message);
  await axios.post(slackWebhookUrl!, { text: message });
}

async function main() {
  try {
    const yesterdayEntries = await getYesterdayEntries();
    const restUsers = await getRestUsers();
    const writtenUsers = new Set(
      yesterdayEntries
        .filter(
          (entry) =>
            !(
              entry.categories.length === 1 && entry.categories[0] === "작성중"
            ),
        )
        .flatMap((entry) => entry.user),
    );
    const restUserEmails = new Set(
      restUsers.flatMap((user) => user.email || []),
    );

    // 미작성 유저 추출 (휴식 중인 유저 제외)
    const missingUsers = Object.keys(registeredUsers)
      .filter((email) => !writtenUsers.has(email) && !restUserEmails.has(email))
      .map((email) => `<@${registeredUsers[email]}>`);

    console.log("작성한 유저:", writtenUsers);
    console.log("휴식 중인 유저:", restUserEmails);
    console.log("미작성 유저:", missingUsers);

    await notifySlack(missingUsers);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
