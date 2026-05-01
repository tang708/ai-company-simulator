import { NextRequest, NextResponse } from "next/server";
import { query, execute, queryOne } from "@/lib/db";

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
      // 简易 Word 解析：提取纯文本
      text = buffer.toString("utf-8")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
        .replace(/[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\n\r]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      // 如果提取失败，使用 buffer 中的可读段
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

    // 存入 product_memory 和更新产品 PRD
    await execute(
      "INSERT INTO product_memory (product_id, `key`, `value`) VALUES (?, 'uploaded_doc', ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = NOW()",
      [Number(productId), text, text]
    );
    await execute(
      "INSERT INTO product_memory (product_id, `key`, `value`) VALUES (?, CONCAT('doc_upload_', NOW()), ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = NOW()",
      [Number(productId), text, text]
    );

    // 自动更新产品 PRD
    await execute(
      "UPDATE products SET prd = CONCAT(IFNULL(prd,''), '\n\n--- 上传文档 ---\n', ?) WHERE id = ?",
      [text.substring(0, 5000), Number(productId)]
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
