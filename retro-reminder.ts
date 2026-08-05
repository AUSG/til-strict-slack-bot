// 격주 수요일 회고 리마인더.
// 매주 월요일 22:00(KST)에 GitHub Actions로 실행되지만, 실제 발송은 "회고하는 주"에만 한다.
// (워크플로: .github/workflows/retro-reminder.yml, cron "00 13 * * 1" = KST 월 22:00)
//
// 회고 주 판정은 RETRO_ANCHOR_DATE 하나로만 이뤄진다. 아래 "격주 주기 제어" 블록 참고.
// 매 회차마다 값을 갱신할 필요는 없다. 한 번 넣어두면 몇 년이 지나도 계속 맞는다.
import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import * as dotenv from "dotenv";
import "dayjs/locale/ko";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("ko"); // 요일 표기를 "수"로 뽑기 위함

dotenv.config();

const KST = "Asia/Seoul";
const WEDNESDAY = 3; // dayjs 요일: 0=일, 1=월, ... 6=토

// ── 격주 주기 제어 ────────────────────────────────────────────────────────────
// RETRO_ANCHOR_DATE는 "다음 회고 날짜"가 아니라 격주 리듬의 위상(phase)을 잡는 기준점이다.
// 다가오는 수요일이 이 날짜와 몇 주 떨어졌는지 세어, 그 차이가 짝수 주면 회고 주로 본다.
//
//   RETRO_ANCHOR_DATE=2026-08-12 → 8/12 발송, 8/19 skip, 8/26 발송, 9/2 skip ...
//
// 그래서 2주마다 값을 갱신할 필요가 없다. 나머지 연산으로 판단하므로 과거 날짜든 미래
// 날짜든, "가장 최근에 한 회고"든 "다음에 할 회고"든 아무거나 넣어도 결과가 같다.
//
// 값을 바꿔야 하는 유일한 경우는 주기 자체가 틀어졌을 때다.
// 연휴로 회고를 다음 주로 미뤘다면 → 새로 잡은 회고 수요일로 이 값만 교체한다.
// 그 날짜가 새 기준이 되어 거기서부터 격주 주기가 다시 흐른다. (코드 수정 불필요)
//
//   9/9 회고를 연휴로 9/16에 했다 → RETRO_ANCHOR_DATE=2026-09-16 → 9/16, 9/30, 10/14 ...
//
// 값은 GitHub Actions의 repository variable로 관리한다.
// (Settings → Secrets and variables → Actions → Variables)
// 비밀값이 아니라 secret 대신 variable을 쓴다. 목록에서 현재 기준일이 눈으로 보여야
// "지금 주기가 어떻게 돌고 있지?"를 확인할 수 있기 때문.
const anchorDateStr = process.env.RETRO_ANCHOR_DATE;
// GitHub Actions에서 미설정 변수는 빈 문자열로 들어오므로 ??가 아닌 ||로 기본값을 받는다.
const intervalWeeks = Number(process.env.RETRO_INTERVAL_WEEKS || 2);

// 격주 판정을 무시하고 무조건 발송 (수동 실행/테스트용)
const force = process.env.RETRO_FORCE === "true";

const slackWebhookUrl =
  process.env.RETRO_SLACK_WEBHOOK_URL || process.env.TIL_SLACK_WEBHOOK_URL;

// 멘션 대상. 채널 전체를 깨우기 싫으면 <!here> 나 <!subteam^팀ID> 로 바꾸면 된다.
const mention = process.env.RETRO_MENTION || "<!channel>";

// 오늘(KST) 기준으로 아직 오지 않은 가장 가까운 수요일. 오늘이 수요일이면 오늘.
// "실행일이 월요일이니 +2일" 로 하드코딩하지 않는 이유는, 수동 실행(workflow_dispatch)이나
// GitHub Actions의 스케줄 지연으로 다른 요일/시각에 돌더라도 항상 "다음 회고 후보일"을
// 가리키게 하기 위함이다. 월요일 정시 실행이면 결과적으로 이번 주 수요일이 된다.
function upcomingWednesday(base: dayjs.Dayjs): dayjs.Dayjs {
  const diff = (WEDNESDAY - base.day() + 7) % 7;
  return base.startOf("day").add(diff, "day");
}

// 기준일이 수요일이 아니어도 동작하도록, 그 날짜가 속한 주(월~일)의 수요일로 정규화한다.
// 예) 연휴 끝나고 목요일에 급하게 값을 적어 넣어도 같은 주 수요일로 해석된다.
function wednesdayOfWeek(base: dayjs.Dayjs): dayjs.Dayjs {
  const daysFromMonday = (base.day() + 6) % 7; // 월=0 ... 일=6
  return base.startOf("day").subtract(daysFromMonday, "day").add(2, "day");
}

// 다가오는 수요일이 "회고하는 주"인지 판단한다.
// 양쪽 다 수요일 00:00으로 맞춰져 있으므로 일수 차이는 항상 7의 배수 → weeksApart는 정수.
//   anchor=8/12, target=8/26 → 14일 → 2주 → 2 % 2 == 0 → 회고 주
//   anchor=8/12, target=8/19 →  7일 → 1주 → 1 % 2 == 1 → 넘어감
function isRetroWeek(target: dayjs.Dayjs, anchor: dayjs.Dayjs): boolean {
  const weeksApart = target.diff(anchor, "day") / 7;
  // anchor가 미래일 수도 있다(예: "다음에 할 회고" 날짜를 넣은 경우). JS의 %는 음수를
  // 그대로 음수로 돌려주므로, +interval 후 다시 나눠 0 이상의 나머지로 보정한다.
  return ((weeksApart % intervalWeeks) + intervalWeeks) % intervalWeeks === 0;
}

const messageTemplates: ((when: string, who: string) => string)[] = [
  (when, who) => `🗓️ ${who} ${when} 회고입니다! 미리 회고거리 좀 챙겨오시죠 😌`,
  (when, who) => `📣 ${who} 잊지 마세요, ${when} 회고 있습니다! 이번엔 진짜로요.`,
  (when, who) => `🍀 ${who} ${when} 회고 예정! 지난 2주 뭐 하셨는지 떠올려 보실 시간~`,
  (when, who) => `⏰ ${who} ${when} 회고 리마인드! 까먹고 지나가면 또 2주 뒤예요 😇`,
];

async function main() {
  // 기준일이 없으면 임의로 추측하지 않고 실패시킨다. 기본값을 넣고 조용히 넘어가면
  // "알림이 안 오는데 원래 안 오는 주인 줄" 알고 지나가게 되어, 애초에 이 봇을 만든
  // 이유(회고를 까먹음)를 그대로 재현하게 된다. Actions가 빨갛게 뜨는 편이 낫다.
  if (!anchorDateStr) {
    console.error(
      "RETRO_ANCHOR_DATE가 없습니다. 회고하는 수요일 하나를 YYYY-MM-DD로 지정해 주세요.",
    );
    process.exit(1);
  }

  const anchorInput = dayjs.tz(anchorDateStr, KST);
  if (!anchorInput.isValid()) {
    console.error(`RETRO_ANCHOR_DATE 형식이 잘못됐습니다: ${anchorDateStr}`);
    process.exit(1);
  }

  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1) {
    console.error(
      `RETRO_INTERVAL_WEEKS는 1 이상의 정수여야 합니다: ${process.env.RETRO_INTERVAL_WEEKS}`,
    );
    process.exit(1);
  }

  if (!slackWebhookUrl) {
    console.error("RETRO_SLACK_WEBHOOK_URL(또는 TIL_SLACK_WEBHOOK_URL)이 없습니다.");
    process.exit(1);
  }

  // 사람이 손으로 넣는 값이라 수요일이 아닌 날짜가 들어올 수 있다. 그대로 쓰면 주 차이가
  // 7의 배수가 아니게 되어 영원히 회고 주로 잡히지 않으므로, 같은 주 수요일로 정규화한다.
  const anchor = wednesdayOfWeek(anchorInput);
  if (anchorInput.day() !== WEDNESDAY) {
    console.warn(
      `RETRO_ANCHOR_DATE(${anchorInput.format("YYYY-MM-DD (ddd)")})가 수요일이 아니라 ` +
        `같은 주 수요일 ${anchor.format("YYYY-MM-DD")}로 해석했습니다.`,
    );
  }

  const today = dayjs().tz(KST);
  const target = upcomingWednesday(today);

  console.log("오늘(KST):", today.format("YYYY-MM-DD HH:mm"));
  console.log("기준 회고일:", anchor.format("YYYY-MM-DD"));
  console.log("다가오는 수요일:", target.format("YYYY-MM-DD"));
  console.log("간격(주):", intervalWeeks);

  if (!isRetroWeek(target, anchor) && !force) {
    console.log("이번 주는 회고 주가 아닙니다. 발송을 건너뜁니다.");
    return;
  }
  if (force) console.log("RETRO_FORCE=true → 격주 판정을 무시하고 발송합니다.");

  // "모레 / 내일 / 오늘"처럼 체감되는 표현을 붙여 준다. (월요일 실행이면 "모레")
  const daysLeft = target.diff(today.startOf("day"), "day");
  const relative =
    daysLeft === 0 ? "오늘" : daysLeft === 1 ? "내일" : daysLeft === 2 ? "모레" : null;
  const dateLabel = `${target.format("M월 D일(ddd)")}`;
  const when = relative ? `${relative} ${dateLabel}` : dateLabel;

  const template =
    messageTemplates[Math.floor(Math.random() * messageTemplates.length)];
  const message = template(when, mention);

  console.log(message);
  await axios.post(slackWebhookUrl, { text: message });
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
