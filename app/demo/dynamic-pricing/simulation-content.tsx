import Link from "next/link";
import PricingDemo from "./pricing-demo";
import styles from "./demo.module.css";

export default function SimulationContent({ organizer = false }: { organizer?: boolean }) {
  return (
    <main className={styles.main}>
      {organizer && <Link href="/organizer/events" className="back-link">Bảng điều khiển ban tổ chức</Link>}
      <h1>Phòng mô phỏng giá vé</h1>
      <p className={styles.intro}>Thử thay đổi nhu cầu mua vé để xem giá điều chỉnh ra sao qua từng chu kỳ 15 phút.</p>
      <PricingDemo />
    </main>
  );
}
