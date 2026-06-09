import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getAttacheeProfile,
  refreshAttacheeProfile,
} from '../api/ai';
import {
  Brain, RefreshCw, Star, AlertTriangle, TrendingUp,
  Tag, Briefcase, ChevronRight, Loader2, ArrowLeft, Radar,
} from 'lucide-react';
import RadarChart from '../components/ai/RadarChart';

// Display labels for the radar axes (kept short so they fit the chart).
const COMP_SHORT = {
  Attendance: 'Attendance',
  Punctuality: 'Punctuality',
  Consistency: 'Consistency',
  Engagement: 'Engagement',
  'Task Performance': 'Tasks',
  Initiative: 'Initiative',
};

function parseField(field) {
  if (!field) return [];
  if (typeof field === 'string') {
    try { return JSON.parse(field); } catch { return []; }
  }
  return field;
}

export default function AttacheeProfilePage() {
  const { attacheeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchProfile = async (refresh = false) => {
    setError(null);
    try {
      if (refresh) {
        setRefreshing(true);
        await refreshAttacheeProfile(attacheeId);
      }
      setLoading(true);
      const { data } = await getAttacheeProfile(attacheeId);
      setProfile(data.profile);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load AI profile');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attacheeId]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      <p className="text-sm text-gray-500 dark:text-gray-400">Generating AI intelligence profile…</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">Analysing attendance and programme data</p>
    </div>
  );

  if (error) return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-subtle hover:text-ink">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-700 dark:text-amber-400">
        {error}
      </div>
    </div>
  );

  if (!profile) return null;

  const strengths = parseField(profile.strengths);
  const weaknesses = parseField(profile.weaknesses);
  const patterns = parseField(profile.behavioral_patterns);
  const careerPaths = parseField(profile.career_paths);
  const workThemes = parseField(profile.work_themes);
  const recommendations = parseField(profile.recommendations);
  const riskFlags = parseField(profile.risk_flags);
  const score = typeof profile.engagement_score === 'number' ? profile.engagement_score : null;

  // Competency scores → radar chart axes (peaks = strengths, dips = growth areas).
  let competencies = profile.competencies;
  if (typeof competencies === 'string') {
    try { competencies = JSON.parse(competencies); } catch { competencies = null; }
  }
  // Accept either an object { Attendance: 85, ... } or an array
  // [{ name|label|skill, score|value }] — the model occasionally returns either.
  let compEntries = [];
  if (Array.isArray(competencies)) {
    compEntries = competencies.map((c) => [
      c.name || c.label || c.skill || c.dimension,
      c.score ?? c.value ?? c.rating,
    ]);
  } else if (competencies && typeof competencies === 'object') {
    compEntries = Object.entries(competencies);
  }
  // Coerce values to numbers (the model sometimes emits "85" or "85%").
  const radarData = compEntries
    .map(([label, v]) => ({
      label: COMP_SHORT[label] || label,
      fullLabel: label,
      value: Number(String(v).replace(/[^0-9.]/g, '')),
    }))
    .filter((d) => d.label && Number.isFinite(d.value))
    .slice(0, 8);

  const ratingClass = {
    Excellent: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
    Strong: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
    Developing: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
    'Needs Support': 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  }[profile.overall_rating] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">AI Intelligence Profile</h1>
            </div>
            {profile.attachee_name && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{profile.attachee_name}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => fetchProfile(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Analysis
        </button>
      </div>

      {/* Summary + rating + engagement */}
      {(profile.summary || profile.overall_rating || profile.headline) && (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {profile.overall_rating && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ratingClass}`}>
                {profile.overall_rating}
              </span>
            )}
            {score != null && (
              <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                <span className="text-xs text-indigo-600 dark:text-indigo-300 font-medium">Engagement</span>
                <div className="h-2 flex-1 max-w-[160px] rounded-full bg-indigo-100 dark:bg-indigo-900 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
                    style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{score}</span>
              </div>
            )}
          </div>
          {profile.headline && (
            <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">{profile.headline}</p>
          )}
          {profile.summary && (
            <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed">{profile.summary}</p>
          )}
          <p className="text-xs text-indigo-500 dark:text-indigo-400">
            {profile.generated_at
              ? `Generated ${new Date(profile.generated_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })} · `
              : ''}
            Powered by NVIDIA NIM
          </p>
        </div>
      )}

      {/* Competency radar — strengths vs growth areas at a glance */}
      {radarData.length >= 3 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2">
            <Radar className="w-4 h-4" />
            <h3 className="font-medium text-sm">Competency Profile</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Each axis is scored 0–100 from this attachee’s data. Peaks are strengths; dips are growth areas.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="flex justify-center">
              <RadarChart data={radarData} size={300} />
            </div>
            <div className="space-y-2.5">
              {radarData.map((d) => (
                <div key={d.fullLabel} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-gray-600 dark:text-gray-300">{d.fullLabel}</span>
                  <div className="h-2 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400"
                      style={{ width: `${Math.max(0, Math.min(100, d.value))}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {Math.round(d.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* No competency scores on this profile (generated before the radar was
          added, or the model omitted them) — prompt a refresh. */}
      {radarData.length < 3 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
            <Radar className="w-4 h-4" />
            <h3 className="font-medium text-sm">Competency Profile</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This profile doesn’t include competency scores yet. Click{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">Refresh Analysis</span> above
            to regenerate it and produce the radar chart.
          </p>
        </div>
      )}

      {/* Risk flags */}
      {riskFlags.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="font-medium text-sm">Risk Flags</h3>
          </div>
          <ul className="space-y-1">
            {riskFlags.map((r, i) => (
              <li key={i} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strengths & Growth Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Star className="w-4 h-4" />
            <h3 className="font-medium text-sm">Strengths</h3>
          </div>
          <ul className="space-y-2">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="font-medium text-sm">Growth Areas</h3>
          </div>
          <ul className="space-y-2">
            {weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Behavioural Patterns */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <TrendingUp className="w-4 h-4" />
          <h3 className="font-medium text-sm">Behavioural Patterns</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {patterns.map((p, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <span className="text-blue-500 font-mono text-xs mt-0.5">{String(i + 1).padStart(2, '0')}</span>
              {p}
            </div>
          ))}
        </div>
      </div>

      {/* Attendance Assessment */}
      {(profile.attendance_assessment || profile.punctuality || profile.consistency) && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <TrendingUp className="w-4 h-4" />
            <h3 className="font-medium text-sm">Attendance Assessment</h3>
          </div>
          {profile.attendance_assessment && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{profile.attendance_assessment}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profile.punctuality && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Punctuality</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{profile.punctuality}</p>
              </div>
            )}
            {profile.consistency && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Consistency</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{profile.consistency}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Work Themes */}
      {workThemes.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
            <Tag className="w-4 h-4" />
            <h3 className="font-medium text-sm">Work Themes (from check-in notes)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {workThemes.map((tag, i) => (
              <span key={i} className="px-3 py-1 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 text-xs rounded-full border border-teal-200 dark:border-teal-800">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Skill Tags */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
          <Tag className="w-4 h-4" />
          <h3 className="font-medium text-sm">Identified Skills</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {(profile.skill_tags || []).map((tag, i) => (
            <span key={i} className="px-3 py-1 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 text-xs rounded-full border border-purple-200 dark:border-purple-800">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Career Paths */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <Briefcase className="w-4 h-4" />
          <h3 className="font-medium text-sm">Recommended Career Paths</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {careerPaths.map((cp, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-sm text-gray-900 dark:text-white leading-tight">{cp.title}</h4>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                  cp.confidence >= 75
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                    : cp.confidence >= 50
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}>
                  {cp.confidence}%
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{cp.reasoning}</p>
              <div className="space-y-1">
                {(cp.next_steps || []).map((step, j) => (
                  <div key={j} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-indigo-500" />
                    {step}
                  </div>
                ))}
              </div>
              {(cp.relevant_skills || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {cp.relevant_skills.map((s, k) => (
                    <span key={k} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 text-[10px] rounded-full">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Star className="w-4 h-4" />
            <h3 className="font-medium text-sm">Recommendations for Supervisor</h3>
          </div>
          <ul className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Report generation (supervisor only) */}
      {user.role === 'supervisor' && (
        <div className="flex gap-3 pt-2">
          <Link
            to={`/ai/reports/new?attacheeId=${attacheeId}&type=progress`}
            className="flex-1 text-center px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            Generate Progress Report
          </Link>
          <Link
            to={`/ai/reports/new?attacheeId=${attacheeId}&type=completion`}
            className="flex-1 text-center px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors text-gray-700 dark:text-gray-300"
          >
            Generate Completion Letter
          </Link>
        </div>
      )}
    </div>
  );
}
