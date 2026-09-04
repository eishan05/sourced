import {
  type IntakeName,
  listIntakeNotes,
  listResumes,
  loadIntakeNote,
  loadResume,
  type ResumeName,
} from "@sourced/examples";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  let text: string;
  if (listResumes().includes(name as ResumeName)) {
    text = loadResume(name as ResumeName);
  } else if (listIntakeNotes().includes(name as IntakeName)) {
    text = loadIntakeNote(name as IntakeName);
  } else {
    return Response.json({ error: "Sample not found" }, { status: 404 });
  }

  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
