"use client";

import { useEffect, useState } from "react";

export default function RecentReadings() {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://localhost:8000/api/readings/recent?limit=10")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch readings");
        return res.json();
      })
      .then((data) => {
        setReadings(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading recent readings...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
      <h2>Recent Readings</h2>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Data ID</th>
            <th>Avg Reading</th>
            <th>Volt Leg 1</th>
            <th>Volt Leg 2</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((reading) => (
            <tr key={reading.id}>
              <td>{reading.timestamp ? new Date(reading.timestamp).toLocaleString() : "N/A"}</td>
              <td>{reading.dataid}</td>
              <td>{reading.avg_reading}</td>
              <td>{reading.volt_leg_1}</td>
              <td>{reading.volt_leg_2}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
