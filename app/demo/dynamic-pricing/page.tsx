import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import SimulationContent from "./simulation-content";
import styles from "./demo.module.css";

export const metadata: Metadata = { title: "Mô phỏng giá vé động · Venu" };

export default function PricingDemoPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><Link href="/" className="brand" prefetch={false}><BrandMark /> venu</Link>
          <span className={styles.separator} /> <span>Mô phỏng giá vé</span></div>
      </header>
      <SimulationContent />
    </div>
  );
}
