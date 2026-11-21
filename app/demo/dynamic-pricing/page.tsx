import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import PricingDemo from "./pricing-demo";
import styles from "./demo.module.css";

export const metadata: Metadata = { title: "Mô phỏng giá vé động · Venu" };

export default function PricingDemoPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><Link href="/" className="brand" prefetch={false}><BrandMark /> venu</Link>
          <span className={styles.separator} /> <span>Mô phỏng giá vé</span></div>
      </header>
      <main className={styles.main}>
        <h1>Phòng mô phỏng giá vé</h1>
        <p className={styles.intro}>Thử thay đổi nhu cầu mua vé để xem giá điều chỉnh ra sao qua từng chu kỳ 15 phút.</p>
        <PricingDemo />
      </main>
    </div>
  );
}
