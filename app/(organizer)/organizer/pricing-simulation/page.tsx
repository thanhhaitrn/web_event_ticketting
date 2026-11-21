import type { Metadata } from "next";
import SimulationContent from "@/app/demo/dynamic-pricing/simulation-content";
import styles from "@/app/demo/dynamic-pricing/demo.module.css";

export const metadata: Metadata = { title: "Mô phỏng giá vé · Ban tổ chức · Venu" };

export default function OrganizerPricingSimulation() {
  return <div className={styles.page}><SimulationContent organizer /></div>;
}
