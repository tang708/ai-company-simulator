import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";
import { setMemory } from "@/lib/agents/memory";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ success: false, error: "需要 multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const productId = formData.get("product_id") as string | null;

    if (!file || !productId) {
      return NextResponse.json({ success: false, error: "需要 file 和 product_id" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      text = buffer.toString("utf-8");
    } else if (fileName.endsWith(".docx")) {
      text = buffer.toString("utf-8")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
        .replace(/[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\n\r]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length < 50) {
        text = buffer.toString("utf-8").replace(/[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\n\r]/g, "");
        text = text.replace(/\s+/g, " ").trim().substring(0, 50000);
      }
    } else {
      text = buffer.toString("utf-8").substring(0, 50000);
    }

    if (!text || text.length < 10) {
      return NextResponse.json({ success: false, error: "无法解析文档内容" }, { status: 400 });
    }

    const pid = Number(productId);

    await setMemory(pid, "uploaded_doc", text.substring(0, 30000));
    await setMemory(pid, `doc_${Date.now()}`, text.substring(0, 10000));

    await execute(
      "UPDATE products SET prd = CONCAT(IFNULL(prd,''), '\n\n--- 上传文档 ---\n', ?) WHERE id = ?",
      [text.substring(0, 5000), pid]
    );

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        size: file.size,
        textLength: text.length,
        preview: text.substring(0, 300) + "...",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "上传失败" },
      { status: 500 }
    );
  }
}
