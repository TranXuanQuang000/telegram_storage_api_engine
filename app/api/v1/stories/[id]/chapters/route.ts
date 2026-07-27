import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const dummyChapters = [
    {
      id: `${id}_chap_1`,
      title: "Chương 1: Khởi Đầu Tín Hiệu",
      consent_status: "VERIFIED",
      provenances: [
        {
          domain: "otruyenapi.com",
          checkedAt: new Date().toISOString(),
          rulesApplied: ["domain_whitelist:true", "robots_txt:true"],
        },
      ],
    },
    {
      id: `${id}_chap_2`,
      title: "Chương 2: Thức Tỉnh Năng Lực",
      consent_status: "VERIFIED",
      provenances: [
        {
          domain: "api.mangadex.org",
          checkedAt: new Date().toISOString(),
          rulesApplied: ["domain_whitelist:true", "robots_txt:true", "opt_in_headers:true"],
        },
      ],
    },
    {
      id: `${id}_chap_3`,
      title: "Chương 3: Hợp Nhất Luồng Dữ Liệu",
      consent_status: "FLAG",
      provenances: [
        {
          domain: "unverified-mirror.net",
          checkedAt: new Date().toISOString(),
          rulesApplied: ["domain_whitelist:false", "tos_keyword_scanner:flagged"],
        },
      ],
    },
  ];

  return NextResponse.json(dummyChapters);
}
