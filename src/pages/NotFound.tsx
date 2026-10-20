import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Cette page n'existe pas.</p>
        <Link to="/" className="text-primary underline">
          Retour à l'accueil
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
