import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getEvent, getEvents } from "@/lib/data";
import EventDetailView, {
  EventDetailFromUrl,
} from "@/components/EventDetailView";

// static export: one HTML file per event in the snapshot, nothing else
export const dynamicParams = false;
export function generateStaticParams() {
  return getEvents().map((e) => ({ id: e.id }));
}

export default async function PublicEventPage({
  params,
}: PageProps<"/events/[id]">) {
  const { id } = await params;
  const event = getEvent(id);
  if (!event) notFound();

  // the fallback (first night) is what the prerendered HTML shows before the URL is read
  return (
    <Suspense fallback={<EventDetailView event={event} dem={null} />}>
      <EventDetailFromUrl event={event} />
    </Suspense>
  );
}
