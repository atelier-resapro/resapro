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
          creneau_id: string;
          id: string;
          prestation_id: string;
          statut: string;
        };
        Insert: {
          client_id: string;
          cree_le?: string | null;
          creneau_id: string;
          id?: string;
          prestation_id: string;
          statut?: string;
        };
        Update: {
          client_id?: string;
          cree_le?: string | null;
          creneau_id?: string;
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
