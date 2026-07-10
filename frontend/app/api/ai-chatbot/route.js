import { NextResponse } from "next/server";
import { runGraph } from "@/lib/ai/graph";

export async function POST(request) {
  try {
    const { message, threadId, category } = await request.json();
    if (!message || !threadId) {
      return NextResponse.json(
        { error: "message and threadId are required" },
        { status: 400 }
      );
    }

    const result = await runGraph(message, threadId, { category: category || null });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in ai-chatbot:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate a response" },
      { status: 500 }
    );
  }
}
