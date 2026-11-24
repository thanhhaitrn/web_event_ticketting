export type Topic = "chat" | "watch" | "trip" | "feedback";
export type ChatLine = { role: "user" | "assistant"; content: string };
export type Night = {
  id: string; eventId: string; title: string; name: string; location: string;
  start: string; end: string; booked: boolean; zones: { id: string; name: string }[];
  feedback: { rating: number; comment: string } | null;
};
export type Watch = {
  id: string; eventId: string; showId: string; title: string; night: string; start: string; zone: string;
  target: number; matchedPrice: number | null; matchedAt: string | null; read: boolean;
};
/** a hotel the model found on the web, with links built by the server */
export type Hotel = { name: string; address?: string; source?: string; rooms: string; directions: string };
export type Reply = { content: string; action: Topic; showId?: string; target?: number; links?: { label: string; url: string }[]; hotels?: Hotel[] };
