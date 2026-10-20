export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          cree_le: string | null;
          id: string;
          nom: string;
          telephone: string;
        };
        Insert: {
          cree_le?: string | null;
          id?: string;
          nom: string;
          telephone: string;
        };
        Update: {
          cree_le?: string | null;
          id?: string;
          nom?: string;
          telephone?: string;
        };
        Relationships: [];
      };
      creneaux: {
        Row: {
          date: string;
          heure_debut: string;
          id: string;
          ouvert: boolean;
        };
        Insert: {
          date: string;
          heure_debut: string;
          id?: string;
          ouvert?: boolean;
        };
        Update: {
          date?: string;
          heure_debut?: string;
          id?: string;
          ouvert?: boolean;
        };
        Relationships: [];
      };
      employe_prestations: {
        Row: {
          employe_id: string;
          prestation_id: string;
        };
        Insert: {
          employe_id: string;
          prestation_id: string;
        };
        Update: {
          employe_id?: string;
          prestation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employe_prestations_employe_id_fkey";
            columns: ["employe_id"];
            isOneToOne: false;
            referencedRelation: "employes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employe_prestations_prestation_id_fkey";
            columns: ["prestation_id"];
            isOneToOne: false;
            referencedRelation: "prestations";
            referencedColumns: ["id"];
          },
        ];
      };
      employes: {
        Row: {
          actif: boolean;
          cree_le: string | null;
          est_gerant: boolean;
          id: string;
          nom: string;
          telephone: string | null;
          user_id: string | null;
        };
        Insert: {
          actif?: boolean;
          cree_le?: string | null;
          est_gerant?: boolean;
          id?: string;
          nom: string;
          telephone?: string | null;
          user_id?: string | null;
        };
        Update: {
          actif?: boolean;
          cree_le?: string | null;
          est_gerant?: boolean;
          id?: string;
          nom?: string;
          telephone?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      fermetures: {
        Row: {
          date: string;
          employe_id: string | null;
          id: string;
          motif: string | null;
        };
        Insert: {
          date: string;
          employe_id?: string | null;
          id?: string;
          motif?: string | null;
        };
        Update: {
          date?: string;
          employe_id?: string | null;
          id?: string;
          motif?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fermetures_employe_id_fkey";
            columns: ["employe_id"];
            isOneToOne: false;
            referencedRelation: "employes";
            referencedColumns: ["id"];
          },
        ];
      };
      horaires: {
        Row: {
          employe_id: string;
          heure_debut: string;
          heure_fin: string;
          id: string;
          jour_semaine: number;
        };
        Insert: {
          employe_id: string;
          heure_debut: string;
          heure_fin: string;
          id?: string;
          jour_semaine: number;
        };
        Update: {
          employe_id?: string;
          heure_debut?: string;
          heure_fin?: string;
          id?: string;
          jour_semaine?: number;
        };
        Relationships: [
          {
            foreignKeyName: "horaires_employe_id_fkey";
            columns: ["employe_id"];
            isOneToOne: false;
            referencedRelation: "employes";
            referencedColumns: ["id"];
          },
        ];
      };
      profils: {
        Row: {
          cree_le: string | null;
          role: string;
          user_id: string;
        };
        Insert: {
          cree_le?: string | null;
          role: string;
          user_id: string;
        };
        Update: {
          cree_le?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      prestations: {
        Row: {
          active: boolean;
          cree_le: string | null;
          duree_minutes: number;
          id: string;
          nom: string;
          prix: number;
        };
        Insert: {
          active?: boolean;
          cree_le?: string | null;
          duree_minutes: number;
          id?: string;
          nom: string;
          prix: number;
        };
        Update: {
          active?: boolean;
          cree_le?: string | null;
          duree_minutes?: number;
          id?: string;
          nom?: string;
          prix?: number;
        };
        Relationships: [];
      };
      rendez_vous: {
        Row: {
          client_id: string;
          cree_le: string | null;
          creneau_id: string | null;
          debut: string;
          employe_id: string;
          fin: string;
          id: string;
          prestation_id: string;
          statut: string;
        };
        Insert: {
          client_id: string;
          cree_le?: string | null;
          creneau_id?: string | null;
          debut: string;
          employe_id: string;
          fin: string;
          id?: string;
          prestation_id: string;
          statut?: string;
        };
        Update: {
          client_id?: string;
          cree_le?: string | null;
          creneau_id?: string | null;
          debut?: string;
          employe_id?: string;
          fin?: string;
          id?: string;
          prestation_id?: string;
          statut?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rendez_vous_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rendez_vous_creneau_id_fkey";
            columns: ["creneau_id"];
            isOneToOne: false;
            referencedRelation: "creneaux";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rendez_vous_employe_id_fkey";
            columns: ["employe_id"];
            isOneToOne: false;
            referencedRelation: "employes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rendez_vous_prestation_id_fkey";
            columns: ["prestation_id"];
            isOneToOne: false;
            referencedRelation: "prestations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      creneaux_libres: {
        Args: { p_date: string };
        Returns: {
          creneau_id: string;
          heure_debut: string;
        }[];
      };
      reserver: {
        Args: {
          p_nom: string;
          p_telephone: string;
          p_prestation_id: string;
          p_creneau_id: string;
        };
        Returns: string;
      };
      recapitulatif: {
        Args: { p_rendez_vous_id: string };
        Returns: {
          prestation: string;
          jour: string;
          heure: string;
          prix: number;
          coiffeur: string;
        }[];
      };
      employes_prestation: {
        Args: { p_prestation_id: string };
        Returns: {
          employe_id: string;
          employe_nom: string;
        }[];
      };
      creneaux_libres_employes: {
        Args: { p_date: string; p_prestation_id: string; p_employe_id?: string };
        Returns: {
          employe_id: string;
          employe_nom: string;
          debut: string;
        }[];
      };
      reserver_employe: {
        Args: {
          p_nom: string;
          p_telephone: string;
          p_prestation_id: string;
          /** null = "Indifférent": the server picks the employee. */
          p_employe_id: string | null;
          p_debut: string;
        };
        Returns: string;
      };
      est_gerant_connecte: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      mon_employe_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      mon_agenda: {
        Args: { p_debut: string; p_fin: string };
        Returns: {
          rendez_vous_id: string;
          debut: string;
          fin: string;
          prestation: string;
          client_nom: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database["public"];

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"];
