import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center">
      <div className="text-center px-4">
        <h1 className="text-5xl font-bold text-white mb-4">Financial Wellness Runner</h1>
        <p className="text-xl text-purple-200 mb-12">Learn financial literacy through a real-time multiplayer game</p>
        <div className="flex flex-col sm:flex-row gap-6 justify-center">
          <button
            onClick={() => navigate('/join')}
            className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white text-xl font-bold rounded-xl shadow-lg transition-transform hover:scale-105"
          >
            I'm a Player
          </button>
          <button
            onClick={() => navigate('/instructor/login')}
            className="px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white text-xl font-bold rounded-xl shadow-lg transition-transform hover:scale-105"
          >
            I'm an Instructor
          </button>
        </div>
      </div>
    </div>
  );
}
