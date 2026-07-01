"use client";

import { useState } from "react";
import CustomersList from "@/components/customers/CustomersList";
import CustomerProfile from "@/components/customers/CustomerProfile";
import CustomerTariff from "@/components/customers/CustomerTariff";
import ConsumptionTrend from "@/components/customers/ConsumptionTrend";
import { useCustomerDetail } from "@/components/customers/useCustomerDetail";
import styles from "@/style/customers/customers.module.css";

export default function CustomersPage() {
  const [selectedId, setSelectedId] = useState(null);
  const { customer, isLoading, error } = useCustomerDetail(selectedId);

  return (
    <div className={styles.layout}>
      <div className={styles.page}>
        <CustomersList selectedId={selectedId} onSelect={setSelectedId} />
        <CustomerProfile customer={customer} isLoading={isLoading} error={error} />
        <CustomerTariff customer={customer} isLoading={isLoading} error={error} />
      </div>
      <ConsumptionTrend dataid={selectedId} />
    </div>
  );
}
