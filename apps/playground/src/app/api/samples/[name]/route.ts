import {
  listResumes,
  loadResume,
  type ResumeName,
} from "@ai-native-forms/examples";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  if (!listResumes().includes(name as ResumeName)) {
    return Response.json({ error: "Sample resume not found" }, { status: 404 });
  }

  return new Response(loadResume(name as ResumeName), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
