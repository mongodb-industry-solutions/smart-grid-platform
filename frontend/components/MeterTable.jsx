"use client";

import { useEffect, useState } from "react";
import axios from "axios";

export default function MeterTable({ meterId }) {
  const [meterData, setMeterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!meterId) return;

    const fetchMeterData = async () => {
      try {
        const response = await axios.get(`/api/readings?meterId=${meterId}`);
        setMeterData(response.data);
        setError("");
      } catch (err) {
        setError("Failed to load meter data");
      } finally {
        setLoading(false);
      }
    };

    fetchMeterData();
    const intervalId = setInterval(fetchMeterData, 5000);

    return () => clearInterval(intervalId);
  }, [meterId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;
  if (!meterData.length) return <div>No readings found.</div>;

  return (
    <div>
      <h1>Smart Meter {meterId}</h1>
      <table>
        <thead>
          <tr>
            <th>Data ID</th>
            <th>Timestamp</th>
            <th>Avg Reading</th>
            <th>Volt Leg 1</th>
            <th>Volt Leg 2</th>
          </tr>
        </thead>
        <tbody>
          {meterData.map((reading, index) => (
            <tr key={`${reading.dataid}-${reading.timestamp}-${index}`}>
              <td>{reading.dataid}</td>
              <td>{new Date(reading.timestamp).toLocaleString()}</td>
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