export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">DevPilot Conductor</h1>
        <p className="text-gray-400 mb-8">
          Manage your AI coding agent fleet with precision.
        </p>
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h2 className="text-xl font-semibold mb-2">Getting Started</h2>
          <p className="text-gray-400">
            The full Conductor UI is being migrated to this workspace.
            Run <code className="text-cyan-400">devpilot serve</code> from your project to launch the local UI.
          </p>
        </div>
      </div>
    </main>
  );
}
