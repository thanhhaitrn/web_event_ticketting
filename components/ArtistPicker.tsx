"use client";

import { useState } from "react";
import { slugify } from "@/lib/slug";

export default function ArtistPicker({
  value,
  suggestions,
  onChange,
}: {
  value: string[];
  suggestions: string[];
  onChange: (artists: string[]) => void;
}) {
  const [text, setText] = useState("");

  // the same name typed differently ("soobin" / "SOOBIN") is one artist
  function add(raw: string) {
    const names = raw.split(",").map((n) => n.trim()).filter(Boolean);
    const next = [...value];
    for (const name of names) {
      const slug = slugify(name);
      if (!slug || next.some((n) => slugify(n) === slug)) continue;
      next.push(suggestions.find((s) => slugify(s) === slug) ?? name);
    }
    onChange(next);
    setText("");
  }

  return (
    <div className="field">
      <label htmlFor="ev-artist">
        Nghệ sĩ / ban nhạc{" "}
        <span className="field-hint">chọn từ gợi ý hoặc gõ tên mới rồi nhấn Enter</span>
      </label>
      {value.length > 0 && (
        <div className="artist-chips">
          {value.map((name) => (
            <span className="artist-chip" key={name}>
              {name}
              <button
                type="button"
                aria-label={`Bỏ ${name}`}
                onClick={() => onChange(value.filter((n) => n !== name))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id="ev-artist"
        list="ev-artist-list"
        value={text}
        placeholder="VD: Mỹ Tâm"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => add(text)}
      />
      <datalist id="ev-artist-list">
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
