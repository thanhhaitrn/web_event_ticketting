"use client";

import { useState } from "react";

export default function FanAuthButtons() {
  const [notice, setNotice] = useState(false);

  function ping() {
    setNotice(true);
    setTimeout(() => setNotice(false), 2400);
  }

  return (
    <>
      <button type="button" className="btn ghost auth-login" onClick={ping}>
        Đăng nhập
      </button>
      <button type="button" className="btn auth-signup" onClick={ping}>
        Đăng ký
      </button>
      <div className={`toast ${notice ? "show" : ""}`}>Tài khoản người hâm mộ đang được phát triển.</div>
    </>
  );
}
