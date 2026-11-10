import { redirect } from "next/navigation";
import { organizerLock, safeNext } from "@/lib/organizer-auth";

const ERRORS: Record<string, string> = {
  password: "Mật khẩu không đúng.",
  config: "Máy chủ chưa được đặt mật khẩu ban tổ chức.",
};

export default async function OrganizerLoginPage({
  searchParams,
}: PageProps<"/organizer/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  // nothing to log in to on a laptop without a password set
  if (organizerLock() === "open") redirect(next);
  const error =
    typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <main className="page">
      <form className="org-login" action="/api/organizer/login" method="post">
        <h1>Đăng nhập ban tổ chức</h1>
        <p className="saved-note">
          Nhập mật khẩu chung của ban tổ chức để quản lý sự kiện.
        </p>
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="org-password">Mật khẩu</label>
          <input
            id="org-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        </div>
        {error && (
          <p className="error-note" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="org-btn solid">
          Đăng nhập
        </button>
      </form>
    </main>
  );
}
