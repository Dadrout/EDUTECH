import { publicStatus, readAiConfig } from "@/lib/ai/config";
import { createAiHandler } from "@/lib/ai/handler";

// AI вызывается только на сервере: ключи — в серверных переменных окружения.
export const maxDuration = 60;

const handler = createAiHandler();

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}

export async function GET(request: Request): Promise<Response> {
  // Чтение запроса делает ответ динамическим: статус не кэшируется при сборке.
  void request.headers.get("host");
  return Response.json(publicStatus(readAiConfig()), { headers: { "Cache-Control": "no-store" } });
}
