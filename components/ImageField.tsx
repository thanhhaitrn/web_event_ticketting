"use client";

import { useEffect, useRef, useState } from "react";
import ImageCropModal from "@/components/ImageCropModal";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export default function ImageField({
  value,
  onChange,
  label = "Ảnh quảng bá",
  hint = "JPG, PNG hoặc WebP, tối đa 5 MB",
  crop = true,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  /** square crop for posters; a venue map keeps its own shape */
  crop?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  // a picked file goes through the crop step first, so every upload matches the square boxes
  const [cropSrc, setCropSrc] = useState("");
  useEffect(() => () => URL.revokeObjectURL(cropSrc), [cropSrc]);

  function pick(file: File) {
    setError("");
    // quick checks here save a round trip; the server re-checks the actual bytes
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Ảnh vượt quá 5 MB.");
      return;
    }
    if (crop) setCropSrc(URL.createObjectURL(file));
    else void upload(file);
  }

  async function upload(blob: Blob) {
    setUploading(true);
    const body = new FormData();
    body.append("file", blob instanceof File ? blob : new File([blob], "event.jpg", { type: "image/jpeg" }));
    const res = await fetch("/api/uploads", { method: "POST", body }).catch(
      () => null,
    );
    setUploading(false);
    if (!res || !res.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error || "Không tải được ảnh, thử lại.");
      return;
    }
    const { url } = await res.json();
    onChange(url);
  }

  return (
    <div className="field">
      <span className="field-label">
        {label} <span className="field-hint">{hint}</span>
      </span>

      <div
        className={`image-drop ${dragging ? "dragging" : ""} ${value ? "has-image" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) pick(file);
        }}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local upload preview */}
            <img
              src={value}
              alt={label}
              className={`image-preview ${crop ? "" : "whole"}`}
            />
            <div className="image-actions">
              <button
                type="button"
                className="btn ghost small"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Đang tải…" : "Đổi ảnh"}
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => onChange("")}
                disabled={uploading}
              >
                Xoá ảnh
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="image-empty"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <circle cx="9" cy="10" r="1.8" />
              <path
                d="M21 16l-5-5-8 8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="image-empty-title">
              {uploading ? "Đang tải ảnh…" : "Kéo thả ảnh vào đây"}
            </span>
            <span className="image-empty-sub">hoặc bấm để chọn từ máy</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) pick(file);
            e.target.value = "";
          }}
        />
      </div>

      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          onClose={() => setCropSrc("")}
          onApply={(blob) => {
            setCropSrc("");
            upload(blob);
          }}
        />
      )}

      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
