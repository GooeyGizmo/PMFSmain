import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface Truck {
  id: string;
  unitNumber: string;
  name?: string;
  make: string;
  model: string;
  year: string;
  licensePlate: string;
  vinNumber?: string;
  regularCapacity: string;
  premiumCapacity: string;
  dieselCapacity: string;
  regularLevel: string;
  premiumLevel: string;
  dieselLevel: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverEmail?: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
}

const FUEL_INFO = {
  "87": {
    unNumber: "UN1203",
    properShippingName: "GASOLINE",
    dangerClass: "3",
    packingGroup: "II",
    placard: "FLAMMABLE LIQUID"
  },
  "91": {
    unNumber: "UN1203",
    properShippingName: "GASOLINE",
    dangerClass: "3",
    packingGroup: "II",
    placard: "FLAMMABLE LIQUID"
  },
  "diesel": {
    unNumber: "UN1202",
    properShippingName: "DIESEL FUEL",
    dangerClass: "3",
    packingGroup: "III",
    placard: "FLAMMABLE LIQUID"
  }
};

interface CompanyInfo {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  ownerName: string;
  ownerEmail: string;
}

export default function ShippingDocument() {
  const [, params] = useRoute("/owner/operations/shipping-document/:truckId");
  const truckId = params?.truckId;

  const { data: companyInfo } = useQuery<CompanyInfo>({
    queryKey: ["/api/company-info"],
    queryFn: async () => {
      const res = await fetch("/api/company-info");
      if (!res.ok) throw new Error("Failed to fetch company info");
      return res.json();
    },
  });

  const { data: truckData, isLoading: truckLoading } = useQuery<{ truck: Truck }>({
    queryKey: ["/api/ops/fleet/trucks", truckId],
    queryFn: async () => {
      const res = await fetch(`/api/ops/fleet/trucks/${truckId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch truck");
      return res.json();
    },
    enabled: !!truckId
  });
  
  const truck = truckData?.truck;

  const handlePrint = () => {
    window.print();
  };

  if (truckLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-copper border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!truck) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Truck not found</p>
      </div>
    );
  }

  const regularLevel = parseFloat(truck.regularLevel) || 0;
  const premiumLevel = parseFloat(truck.premiumLevel) || 0;
  const dieselLevel = parseFloat(truck.dieselLevel) || 0;
  
  const activeFuels = [
    regularLevel > 0 ? { type: "87", amount: regularLevel, info: FUEL_INFO["87"] } : null,
    premiumLevel > 0 ? { type: "91", amount: premiumLevel, info: FUEL_INFO["91"] } : null,
    dieselLevel > 0 ? { type: "diesel", amount: dieselLevel, info: FUEL_INFO["diesel"] } : null
  ].filter(Boolean);

  const totalLitres = regularLevel + premiumLevel + dieselLevel;

  return (
    <>
      <div className="print:hidden bg-background p-4 flex items-center gap-4 border-b">
        <Link href="/owner/operations?tab=fleet">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Fleet
          </Button>
        </Link>
        <Button onClick={handlePrint} data-testid="button-print-document">
          <Printer className="w-4 h-4 mr-2" />
          Print Document
        </Button>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white text-black print:p-4">
        <div className="border-4 border-black p-6 print:p-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase tracking-wide">TRANSPORTATION OF DANGEROUS GOODS</h1>
            <h2 className="text-xl font-bold">SHIPPING DOCUMENT</h2>
            <p className="text-sm mt-2">Pursuant to Transportation of Dangerous Goods Act and Regulations</p>
          </div>

          <div className="border-2 border-black mb-6">
            <div className="grid grid-cols-2 border-b-2 border-black">
              <div className="p-3 border-r-2 border-black">
                <p className="text-xs font-bold uppercase">Consignor (Shipper):</p>
                <p className="font-bold">{companyInfo?.companyName || "Prairie Mobile Fuel Services"}</p>
                <p className="text-sm">{companyInfo?.companyAddress || "Calgary, Alberta"}</p>
                <p className="text-sm">{companyInfo?.ownerEmail || "levi.ernst@prairiemobilefuel.ca"}</p>
                <p className="text-sm">{companyInfo?.companyPhone || "403-430-0390"}</p>
              </div>
              <div className="p-3">
                <p className="text-xs font-bold uppercase">Document Date & Time:</p>
                <p className="font-bold">{format(new Date(), "MMMM d, yyyy")}</p>
                <p className="text-sm">{format(new Date(), "h:mm a")}</p>
                <p className="text-xs mt-2 font-bold uppercase">Document Number:</p>
                <p className="font-mono">TDG-{truck.unitNumber}-{format(new Date(), "yyyyMMdd-HHmm")}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 border-b-2 border-black">
              <div className="p-3 border-r-2 border-black">
                <p className="text-xs font-bold uppercase">Consignee (Receiver):</p>
                <p className="font-bold">Various - Mobile Delivery Service</p>
                <p className="text-sm">Greater Calgary Area</p>
              </div>
              <div className="p-3">
                <p className="text-xs font-bold uppercase">Carrier:</p>
                <p className="font-bold">{companyInfo?.companyName || "Prairie Mobile Fuel Services"}</p>
                <p className="text-sm">Unit: {truck.unitNumber}</p>
                <p className="text-sm">License: {truck.licensePlate}</p>
              </div>
            </div>

            <div className="p-3 border-b-2 border-black">
              <p className="text-xs font-bold uppercase">Driver Information:</p>
              {truck.assignedDriverName ? (
                <p className="font-bold">{truck.assignedDriverName}</p>
              ) : (
                <p className="text-muted-foreground italic">No driver assigned</p>
              )}
            </div>

            <div className="p-3 border-b-2 border-black">
              <p className="text-xs font-bold uppercase">Vehicle Information:</p>
              <p>{truck.year} {truck.make} {truck.model} {truck.vinNumber ? `| VIN: ${truck.vinNumber}` : ''}</p>
            </div>
          </div>

          <div className="border-2 border-black mb-6">
            <div className="bg-black text-white p-2 font-bold uppercase text-center">
              Dangerous Goods Description
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="p-2 text-left border-r border-black text-sm">UN No.</th>
                  <th className="p-2 text-left border-r border-black text-sm">Proper Shipping Name</th>
                  <th className="p-2 text-center border-r border-black text-sm">Class</th>
                  <th className="p-2 text-center border-r border-black text-sm">PG</th>
                  <th className="p-2 text-right text-sm">Quantity (L)</th>
                </tr>
              </thead>
              <tbody>
                {activeFuels.map((fuel: any) => (
                  <tr key={fuel.type} className="border-b border-black">
                    <td className="p-2 font-mono border-r border-black">{fuel.info.unNumber}</td>
                    <td className="p-2 font-bold border-r border-black">{fuel.info.properShippingName} ({fuel.type === "diesel" ? "Diesel" : fuel.type + " Octane"})</td>
                    <td className="p-2 text-center border-r border-black">{fuel.info.dangerClass}</td>
                    <td className="p-2 text-center border-r border-black">{fuel.info.packingGroup}</td>
                    <td className="p-2 text-right font-bold">{fuel.amount.toFixed(1)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100">
                  <td colSpan={4} className="p-2 text-right font-bold border-r border-black">TOTAL:</td>
                  <td className="p-2 text-right font-bold">{totalLitres.toFixed(1)} L</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-2 border-red-600 bg-red-50 p-4 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-red-600 text-white flex items-center justify-center font-bold text-xl">
                3
              </div>
              <div>
                <p className="font-bold text-red-700 uppercase">Flammable Liquid - Class 3</p>
                <p className="text-sm">Keep away from heat, sparks, open flames, hot surfaces. No smoking.</p>
              </div>
            </div>
          </div>

          <div className="border-2 border-black p-4 mb-6 bg-yellow-50">
            <p className="font-bold uppercase text-center mb-2">24-HOUR EMERGENCY CONTACT</p>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">CANUTEC: 1-888-226-8832</p>
              <p className="text-sm mt-1">Canadian Transport Emergency Centre (24/7)</p>
              <p className="text-sm text-gray-600 mt-2">For spills, leaks, fires, or exposure involving these dangerous goods</p>
            </div>
          </div>

          <div className="border-2 border-black p-4 mb-6">
            <p className="font-bold uppercase mb-2">Additional Emergency Contacts:</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-bold">Emergency Services:</p>
                <p className="text-lg">911</p>
              </div>
              <div>
                <p className="font-bold">Company Contact:</p>
                <p>{companyInfo?.ownerName || "Levi Ernst"}: {companyInfo?.companyPhone || "403-430-0390"}</p>
              </div>
            </div>
          </div>

          <div className="border-2 border-black p-4">
            <p className="text-xs mb-4">
              I hereby declare that the contents of this consignment are fully and accurately described above by proper shipping name, 
              are classified, packaged, marked and labeled/placarded, and are in all respects in proper condition for transport 
              according to applicable international and national governmental regulations.
            </p>
            <div className="grid grid-cols-2 gap-8 mt-6">
              <div>
                <p className="text-xs font-bold uppercase mb-4">Shipper Signature:</p>
                <div className="border-b border-black h-8"></div>
                <p className="text-xs mt-1">{companyInfo?.companyName || "Prairie Mobile Fuel Services"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase mb-4">Driver Signature:</p>
                <div className="border-b border-black h-8"></div>
                <p className="text-xs mt-1">{truck.assignedDriverName || "________________"}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-gray-500">
            <p>This document must be carried in the vehicle at all times during transport of dangerous goods.</p>
            <p>Document generated: {format(new Date(), "yyyy-MM-dd HH:mm:ss")}</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .max-w-4xl, .max-w-4xl * {
            visibility: visible;
          }
          .max-w-4xl {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            margin: 0.5in;
          }
        }
      `}</style>
    </>
  );
}
