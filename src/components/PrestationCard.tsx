import { Card, CardContent } from "@/components/ui/card";
import { formatDuree, formatPrix } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";

const PrestationCard = ({ prestation }: { prestation: Tables<"prestations"> }) => (
  <Card>
    <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-4">
      <div>
        <h3 className="font-semibold">{prestation.nom}</h3>
        <p className="text-sm text-muted-foreground">{formatDuree(prestation.duree_minutes)}</p>
      </div>
      <p className="text-lg font-semibold">{formatPrix(prestation.prix)}</p>
    </CardContent>
  </Card>
);

export default PrestationCard;
