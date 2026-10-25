import { authenticateRequest } from "@/lib/auth/authenticated-request";
import {
  executeExerciseCommand,
  exerciseFailure,
  exerciseUnavailable,
} from "@/lib/fitness/exercise-commands";
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, {
      allowedCredentials: ["cookie"],
      requiredPermission: "write",
    });
    if (!auth.ok) return exerciseFailure("unauthenticated", auth.status);
    if (request.headers.get("X-Train-Owner") !== auth.principal.userId)
      return exerciseFailure("unauthenticated", 403);
    return await executeExerciseCommand(
      request,
      auth.client,
      auth.principal.userId,
    );
  } catch {
    return exerciseUnavailable("unexpected_exception");
  }
}
