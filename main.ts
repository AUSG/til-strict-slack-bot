import { Client } from "@notionhq/client";

import axios from "axios";
import * as dotenv from "dotenv";

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
    "wls4013@inu.ac.kr": "U07BL68MR8F", // 진성님
    "hjforaws@gmail.com": "U07CDBSB2BB", // 현제님
    "hajuny129@hufs.ac.kr": "U05FAS0GB99", // 하준님
    "kdhhuns2000@gmail.com": "U07C1RDLFQS", // 도훈님
};

function getTargetDateStr(): string {
    const now = new Date();
    // UTC 기준 시간에서 9시간 더하면 KST
    const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    // KST 시간에서 4시간을 빼서 마감일(대상 일자)을 유도 (새벽 0~3시 산입)
    const targetKSTTime = new Date(kstTime.getTime() - 4 * 60 * 60 * 1000);

    return `${targetKSTTime.getUTCFullYear()}-${String(targetKSTTime.getUTCMonth() + 1).padStart(2, "0")}-${String(targetKSTTime.getUTCDate()).padStart(2, "0")}`;
}

async function getYesterdayEntries() {
    const targetDateStr = getTargetDateStr();

    // 타임존 이슈를 피하기 위해 Notion에서는 넉넉히 최근 이틀치 데이터를 모두 가져옵니다.
    const fetchStartDateObj = new Date(new Date().getTime() - 2 * 24 * 60 * 60 * 1000);
    const fetchStartDateStr = fetchStartDateObj.toISOString().split("T")[0];

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

        // 시간에 대한 정보가 있으면 (예: 2026-03-06T07:50:00.000+09:00)
        if (pageDateStr.includes("T")) {
            const dateObj = new Date(pageDateStr);
            // dateObj에 9시간 더해서 KST 기준으로 변환 (getUTC* 로 날짜 추출 시 로컬시간 활용 가능)
            const kstDateObj = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
            const kstFormattedStr = `${kstDateObj.getUTCFullYear()}-${String(kstDateObj.getUTCMonth() + 1).padStart(2, "0")}-${String(kstDateObj.getUTCDate()).padStart(2, "0")}`;
            return kstFormattedStr === targetDateStr;
        } else {
            // 날짜만 있는 경우 ("2026-03-06")
            return pageDateStr === targetDateStr;
        }
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

async function notifySlack(missingUsers) {
    if (missingUsers.length === 0) return;

    const message = `🚨 안쓰고 뭐하셨어요! : ${missingUsers.join(", ")}님!`;
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
