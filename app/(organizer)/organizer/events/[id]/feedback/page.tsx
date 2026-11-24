import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

const pageSize = 20;
const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

export default async function FeedbackPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { name: true } });
  if (!event) notFound();
  const where = { show: { eventId: id } };
  const stats = await prisma.eventFeedback.aggregate({ where, _count: true, _avg: { rating: true } });
  const pages = Math.max(1, Math.ceil(stats._count / pageSize));
  const requested = Number((await searchParams).page);
  const page = Number.isSafeInteger(requested) ? Math.min(pages, Math.max(1, requested)) : 1;
  const reviews = await prisma.eventFeedback.findMany({
    where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
    select: { id: true, rating: true, comment: true, updatedAt: true, show: { select: { name: true } } },
  });
  return <main className="page narrow">
    <Link href={`/organizer/events/${id}`} className="back-link">← {event.name}</Link>
    <div className="page-head"><div><h1>Cảm nhận của khán giả</h1>
      {stats._avg.rating !== null && <p className="sub">{stats._avg.rating.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}/5 sao · {stats._count} đánh giá</p>}
    </div></div>
    {!reviews.length && <p className="empty-state">Chưa có đánh giá. Khán giả có thể gửi cảm nhận sau khi suất diễn kết thúc.</p>}
    {reviews.map(review => <article className="card" key={review.id}>
      <strong>{review.show.name} · {review.rating}/5 sao</strong>
      <p className="sub">{dateFormat.format(review.updatedAt)}</p>
      {review.comment && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{review.comment}</p>}
    </article>)}
    {pages > 1 && <nav className="actions" aria-label="Trang đánh giá">
      {page > 1 && <Link className="btn ghost" href={`?page=${page - 1}`}>Trang trước</Link>}
      <span>{page} / {pages}</span>
      {page < pages && <Link className="btn ghost" href={`?page=${page + 1}`}>Trang sau</Link>}
    </nav>}
  </main>;
}
