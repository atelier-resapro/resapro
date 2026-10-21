import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Index from "./pages/Index";
import Reserver from "./pages/Reserver";
import Confirmation from "./pages/Confirmation";
import NotFound from "./pages/NotFound";

// The manager pages are loaded only when needed (smaller first download for clients).
const GerantLayout = lazy(() => import("./components/GerantLayout"));
const GerantConnexion = lazy(() => import("./pages/GerantConnexion"));
const GerantPlanning = lazy(() => import("./pages/GerantPlanning"));
const GerantPrestations = lazy(() => import("./pages/GerantPrestations"));
const GerantJournees = lazy(() => import("./pages/GerantJournees"));
const GerantEmployes = lazy(() => import("./pages/GerantEmployes"));
const EmployeLayout = lazy(() => import("./components/EmployeLayout"));
const EmployeAgenda = lazy(() => import("./pages/EmployeAgenda"));
const DefinirMotDePasse = lazy(() => import("./pages/DefinirMotDePasse"));
const ClientConnexion = lazy(() => import("./pages/ClientConnexion"));
const ClientRendezVous = lazy(() => import("./pages/ClientRendezVous"));
const GerantParametres = lazy(() => import("./pages/GerantParametres"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster />
    <BrowserRouter>
      <Suspense fallback={<p className="p-6 text-muted-foreground">Chargement…</p>}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/reserver" element={<Reserver />} />
          <Route path="/confirmation/:id" element={<Confirmation />} />
          <Route path="/client/connexion" element={<ClientConnexion />} />
          <Route path="/client" element={<ClientRendezVous />} />
          <Route path="/gerant/connexion" element={<GerantConnexion />} />
          <Route path="/gerant" element={<GerantLayout />}>
            <Route index element={<GerantPlanning />} />
            <Route path="prestations" element={<GerantPrestations />} />
            <Route path="journees" element={<GerantJournees />} />
            <Route path="employes" element={<GerantEmployes />} />
            <Route path="parametres" element={<GerantParametres />} />
          </Route>
          <Route path="/employe" element={<EmployeLayout />}>
            <Route index element={<EmployeAgenda />} />
          </Route>
          <Route path="/mot-de-passe" element={<DefinirMotDePasse />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
