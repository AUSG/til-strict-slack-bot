import RedisService from "../service/redis.service";
import SlackService from "../service/slack.service";

const slackService = new SlackService();

export const handler = async (event: any) => {
    try {
        // API Gateway로부터 받은 이벤트 파싱
        const body = JSON.parse(event.body);

        // Slack의 이벤트 검증
        if (body.type === "url_verification") {
            return {
                statusCode: 200,
                body: JSON.stringify({challenge: body.challenge}),
            };
        }

        // 메시지 이벤트 처리
        if (body.event && body.event.type === "message" && body.event.channel_type === "im") {
            const message = body.event.text.toLowerCase().trim();
            const userId = body.event.user;

            // "rest {number}" 형식의 명령어 처리
            const match = message.match(/^rest\s+(\d+)$/);
            if (match) {
                const restDays = parseInt(match[1]);

                if (restDays > 0 && restDays <= 30) {
                    // 최대 30일로 제한
                    // Redis 클라이언트 가져오기
                    const redis = RedisService.getInstance();

                    // 현재 시간부터 N일 후의 Unix 타임스탬프 계산
                    const now = Math.floor(Date.now() / 1000);
                    const expiryTime = now + restDays * 24 * 60 * 60;

                    // Redis에 저장 (사용자 ID를 키로 사용)
                    const key = `rest:${userId}`;
                    await redis.set(key, "true");
                    await redis.expire(key, restDays * 24 * 60 * 60); // 자동 만료 설정

                    // 사용자에게 확인 메시지 전송
                    const endDate = new Date(expiryTime * 1000).toLocaleDateString();
                    await slackService.sendMessage(
                        body.event.channel,
                        `✅ ${restDays}일 동안의 휴식이 설정되었습니다. (${endDate} 까지)`
                    );
                } else {
                    await slackService.sendMessage(body.event.channel, "❌ 휴식 기간은 1-30일 사이로 설정해주세요.");
                }
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({message: "OK"}),
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({error: "Internal server error"}),
        };
    }
};
