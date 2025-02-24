import {Client} from "@notionhq/client";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const notion = new Client({auth: process.env.NOTION_API_KEY});
const databaseId = process.env.NOTION_DATABASE_ID;
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

// 미리 등록된 유저 리스트
const registeredUsers = {
    "jun020216@sookmyung.ac.kr": "U07C0N85M2P", // 예준님
    "itoodo12@gmail.com": "U07BY0KMU69", // 수민님
    "maroony55@gmail.com": "U07BU0BSSK0", // 가영님
    "gurwns9325@cau.ac.kr": "U07C32AK8KE", // 혁준님
    // "su10jin11@khu.ac.kr": "U07C19GL9V1", // 수진님
    "wls4013@inu.ac.kr": "U07BL68MR8F", // 진성님
    "hjforaws@gmail.com": "U07CDBSB2BB", // 현제님
    "hajuny129@hufs.ac.kr": "U05FAS0GB99", // 하준님
    "kdhhuns2000@gmail.com": "U07C1RDLFQS", // 도훈님
};

async function getYesterdayEntries() {
    const now = new Date();
    const yesterday = now.toISOString().split("T")[0]; // YYYY-MM-DD

    const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
            property: "날짜", // Notion의 날짜 필드 이름
            date: {
                equals: yesterday,
            },
        },
    });

    return response.results.map((page) => ({
        id: page.id,
        user: page.properties.사람?.people?.map((user) => user.person.email) || [],
    }));
}

async function notifySlack(missingUsers) {
    if (missingUsers.length === 0) return;

    const message = `🚨 안쓰고 뭐하셨어요! : ${missingUsers.join(", ")}님!`;
    await axios.post(slackWebhookUrl, {text: message});
}

async function main() {
    try {
        const yesterdayEntries = await getYesterdayEntries();
        const writtenUsers = new Set(yesterdayEntries.flatMap((entry) => entry.user));

        // 미작성 유저 추출
        const missingUsers = Object.keys(registeredUsers)
            .filter((email) => !writtenUsers.has(email))
            .map((email) => `<@${registeredUsers[email]}>`); // Slack 멘션 형식

        console.log("작성한 유저:", writtenUsers);
        console.log("미작성 유저:", missingUsers);

        await notifySlack(missingUsers);
    } catch (error) {
        console.error("Error:", error);
    }
}

main();
