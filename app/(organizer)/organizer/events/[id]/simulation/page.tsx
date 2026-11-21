import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EventSimulation from "./event-simulation";
import s from "@/app/demo/dynamic-pricing/demo.module.css";

export const metadata = { title: "Mô phỏng sự kiện · Ban tổ chức · Venu" };

export default async function SimulationPage({ params, searchParams }: PageProps<"/organizer/events/[id]/simulation">) {
  const [{ id }, { phase }] = await Promise.all([params, searchParams]);
  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      name: true,
      shows: { orderBy: { startTime: "asc" }, select: { id: true, name: true, startTime: true } },
      phases: { orderBy: { startTime: "asc" }, select: { id: true, name: true, startTime: true, endTime: true } },
      zones: { orderBy: { createdAt: "asc" }, select: {
        id: true, name: true,
        quotas: { select: { showId: true, capacity: true } },
        prices: { select: { phaseId: true, floorPrice: true, basePrice: true, ceilingPrice: true } },
      } },
    },
  });
  if (!event) notFound();
  return <div className={s.page}><main className={s.main}>
    <Link className="back-link" href={`/organizer/events/${id}`}>← Quay lại sự kiện</Link>
    <header className={s.head}><div><p className={s.eyebrow}>Định giá động</p><h1>Mô phỏng giá vé</h1><p className={s.intro}>{event.name}</p></div></header>
    <EventSimulation event={event} initialPhase={typeof phase === "string" ? phase : undefined} />
  </main></div>;
}
