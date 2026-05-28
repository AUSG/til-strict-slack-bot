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
    "kill5038@gmail.com": "U07C2RS4VRT", // 상혁님
    "jun020216@sookmyung.ac.kr": "U07C0N85M2P", // 예준님
    "itoodo12@gmail.com": "U07BY0KMU69", // 수민님
    "maroony55@gmail.com": "U07BU0BSSK0", // 가영님
    "gurwns9325@cau.ac.kr": "U07C32AK8KE", // 혁준님
    "su10jin11@khu.ac.kr": "U07C19GL9V1", // 수진님
    // "wls4013@inu.ac.kr": "U07BL68MR8F", // 진성님
    "hjforaws@gmail.com": "U07CDBSB2BB", // 현제님
    "hajuny129@gmail.com": "U05FAS0GB99", // 하준님
    "kdhhuns2000@gmail.com": "U07C1RDLFQS", // 도훈님
};

function getTargetDateStr(): string {
    // cron은 UTC 18:00 (KST 익일 03:00)에 돌며, 마감일은 항상 KST 기준 "어제"입니다.
    // GitHub Actions가 수 시간 지연돼도(예: KST 05시 이후 실행) 같은 KST 날 안이면
    // "어제"는 변하지 않으므로, KST 현재 시각에서 명시적으로 하루를 뺍니다.
    return dayjs().tz(KST).subtract(1, "day").format("YYYY-MM-DD");
}

async function getYesterdayEntries() {
    const targetDateStr = getTargetDateStr();

    // 타임존 이슈를 피하기 위해 Notion에서는 넉넉히 최근 이틀치 데이터를 모두 가져옵니다.
    const fetchStartDateStr = dayjs().tz(KST).subtract(2, "day").format("YYYY-MM-DD");

    const response = await notion.databases.query({
        database_id: databaseId!,
        filter: {
            property: "날짜", // Notion의 날짜 필드 이름
            date: {
                on_or_after: fetchStartDateStr,
            },
        },
    });

    // 자바스크립트 단에서 실제 Target Date와 대조하여 정확하게 필터링
    const filteredResults = response.results.filter((page: any) => {
        const pageDateStr = page.properties["날짜"]?.date?.start;
        if (!pageDateStr) return false;

        // 시간 정보가 있으면(예: 2026-03-06T07:50:00.000+09:00) KST 기준 날짜로 변환해 비교,
        // 날짜만 있으면("2026-03-06") 그대로 비교.
        if (pageDateStr.includes("T")) {
            return dayjs(pageDateStr).tz(KST).format("YYYY-MM-DD") === targetDateStr;
        }
        return pageDateStr === targetDateStr;
    });

    return filteredResults.map((page: any) => ({
        id: page.id,
        user: page.properties.사람?.people?.map((user) => user.person.email) || [],
        categories: page.properties.분야?.multi_select?.map((tag) => tag.name) || [],
    }));
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

    return response.results.map((page: any) => ({
        email: page.properties.사람?.people?.map((user) => user.person.email),
    }));
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
                .filter((entry) => !(entry.categories.length === 1 && entry.categories[0] === "쓰는 중"))
                .flatMap((entry) => entry.user)
        );
        const restUserEmails = new Set(restUsers.flatMap((user) => user.email || []));

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
