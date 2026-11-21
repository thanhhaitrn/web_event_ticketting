import Link from "next/link";
import PricingDemo from "./pricing-demo";
import styles from "./demo.module.css";

export default function SimulationContent({ organizer = false }: { organizer?: boolean }) {
  return (
    <main className={styles.main}>
      {organizer && <Link href="/organizer/events" className="back-link">← Bảng điều khiển</Link>}
      <PricingDemo />
    </main>
  );
}
