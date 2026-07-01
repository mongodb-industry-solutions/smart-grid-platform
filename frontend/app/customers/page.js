"use client";

import { useState } from "react";
import CustomersList from "@/components/customers/CustomersList";
import CustomerLatestReading from "@/components/customers/CustomerLatestReading";
import CustomerProfile from "@/components/customers/CustomerProfile";
import ConsumptionTrend from "@/components/customers/ConsumptionTrend";
import TariffRecommendation from "@/components/customers/TariffRecommendation";
import ApplianceUsage from "@/components/customers/ApplianceUsage";
import UsageSegment from "@/components/customers/UsageSegment";
import { useCustomerDetail } from "@/components/customers/useCustomerDetail";
import styles from "@/style/customers/customers.module.css";

export default function CustomersPage() {
  const [selectedId, setSelectedId] = useState(null);
  const { customer, isLoading, error } = useCustomerDetail(selectedId);

  return (
    <div className={styles.layout}>
      <div className={styles.page}>
        <div className={styles.areaList}>
          <CustomersList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className={styles.areaLatest}>
          <CustomerLatestReading
            customer={customer}
            isLoading={isLoading}
            error={error}
          />
          <UsageSegment dataid={selectedId} />
        </div>
        <div className={styles.areaDetail}>
          <CustomerProfile
            customer={customer}
            isLoading={isLoading}
            error={error}
          />
        </div>
        <div className={styles.areaRec}>
          <TariffRecommendation dataid={selectedId} />
          <ApplianceUsage dataid={selectedId} />
        </div>
        <div className={styles.areaTrend}>
          <ConsumptionTrend dataid={selectedId} />
        </div>
      </div>
    </div>
  );
}
