import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Index from "./pages/Index";
import Reserver from "./pages/Reserver";
import Confirmation from "./pages/Confirmation";
import GerantLayout from "./components/GerantLayout";
import GerantConnexion from "./pages/GerantConnexion";
import GerantPlanning from "./pages/GerantPlanning";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/reserver" element={<Reserver />} />
        <Route path="/confirmation/:id" element={<Confirmation />} />
        <Route path="/gerant/connexion" element={<GerantConnexion />} />
        <Route path="/gerant" element={<GerantLayout />}>
          <Route index element={<GerantPlanning />} />
        </Route>
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
