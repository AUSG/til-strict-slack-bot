import {registeredUsers} from "../common/registered-user";
import SlackService from "../service/slack.service";
import NotionService from "../service/notion.service";
import RedisService from "../service/redis.service";

const slackService = new SlackService();
const notionService = new NotionService();

export const handler = async (event: any) => {
    try {
        // 어제 작성된 TIL 확인
        const yesterdayEntries = await notionService.getYesterdayTILWriter();
        const writtenUsers = new Set(yesterdayEntries.flatMap((entry) => entry.user));

        // Redis 클라이언트 가져오기
        const redis = RedisService.getInstance();

        // Redis에 저장된 휴식 중인 사용자 확인
        const restingKeysPattern = "rest:*";
        const restingKeys = await redis.keys(restingKeysPattern);
        const restingUserIds = restingKeys.map((key) => key.split(":")[1]);

        // 휴식 중이 아니면서 작성하지 않은 사용자 필터링
        const missingUsers = Object.entries(registeredUsers)
            .filter(([email, slackId]) => {
                return !writtenUsers.has(email) && !restingUserIds.includes(slackId);
            })
            .map(([_, slackId]) => `<@${slackId}>`);

        if (missingUsers.length > 0) {
            const message = `🚨 안쓰고 뭐하셨어요! : ${missingUsers.join(", ")}님!`;
            await slackService.sendTILNotification(message);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({message: "Check completed"}),
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({error: "Internal server error"}),
        };
    }
};
