"use client";

// import InfoWizard from "@/components/infoWizard/InfoWizard";

// export default function Home() {
//   return (
//     <main className="min-h-screen relative">
//       <div className="fixed top-0 left-0 h-screen z-50">
//         {/* <InfoWizard /> */}
//         <div>Monitoring page</div>
//       </div>
//     </main>
//   );
// }


import { redirect } from "next/navigation";

export default function Home() {
  redirect("/monitoring");
}