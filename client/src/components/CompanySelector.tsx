import { useCompany } from "@/hooks/use-company";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

export function CompanySelector() {
  const { selectedCompanyId, setSelectedCompanyId, companies, isLoading } = useCompany();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 animate-pulse">
        <Building2 className="h-4 w-4" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!companies || companies.length === 0) {
    return null;
  }

  if (companies.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300">
        <Building2 className="h-4 w-4" />
        <span>{companies[0].name}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-gray-400" />
      <Select
        value={selectedCompanyId?.toString()}
        onValueChange={(value) => setSelectedCompanyId(parseInt(value))}
      >
        <SelectTrigger className="w-[200px] bg-gray-800 border-gray-700 text-white">
          <SelectValue placeholder="Select company" />
        </SelectTrigger>
        <SelectContent className="bg-gray-800 border-gray-700">
          {companies.map((company) => (
            <SelectItem
              key={company.id}
              value={company.id.toString()}
              className="text-white hover:bg-gray-700 focus:bg-gray-700"
            >
              {company.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
