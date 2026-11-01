import { NextResponse } from "next/server";
import { DomainError } from "@/lib/domain";

/** một quy tắc nghiệp vụ bị vi phạm → mã lỗi của nó (mặc định 400) kèm thông báo; lỗi khác vẫn ném tiếp (500) */
export function domainErrorResponse(e: unknown) {
  if (e instanceof DomainError) {
    return NextResponse.json({ error: e.message, ...e.details }, { status: e.status });
  }
  throw e;
}
