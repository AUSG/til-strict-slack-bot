import {Client} from "@notionhq/client";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const notion = new Client({auth: process.env.NOTION_API_KEY});
const databaseId = process.env.NOTION_DATABASE_ID;
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

// 미리 등록된 유저 리스트
const registeredUsers = ["이현제", "진성 공", "김수진", "손수민", "박예준", "김도훈", "유하준", "홍혁준", "박가영"];

async function getYesterdayEntries() {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
            property: "날짜", // Notion의 날짜 필드 이름
            date: {
                equals: today,
            },
        },
    });

    return response.results.map((page) => ({
        id: page.id,
        user: page.properties.사람?.people?.map((p) => p.name) || [],
    }));
}

async function notifySlack(missingUsers) {
    if (missingUsers.length === 0) return;

    const message = `🚨 안쓰고 뭐하셨어요! : ${missingUsers.join(", ")}`;
    await axios.post(slackWebhookUrl, {text: message});
}

async function main() {
    try {
        const yesterdayEntries = await getYesterdayEntries();
        const writtenUsers = new Set(yesterdayEntries.flatMap((entry) => entry.user));
        const missingUsers = registeredUsers.filter((user) => !writtenUsers.has(user));

        console.log("작성한 유저:", writtenUsers);
        console.log("미작성 유저:", missingUsers);

        await notifySlack(missingUsers);
    } catch (error) {
        console.error("Error:", error);
    }
}

main();
