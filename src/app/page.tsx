'use client';

import Link from 'next/link';
import {
  Sparkles,
  Users,
  MapPin,
  Zap,
  CheckCircle,
  Star,
  ArrowRight,
  Globe,
  Shield,
  BarChart3,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-sky-800 to-green-800 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-display font-bold text-slate-900">triphive</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="btn-ghost">
              Log In
            </Link>
            <Link href="/auth/signup" className="btn-primary">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="gradient-hero text-white py-20 sm:py-32 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full blur-3xl bg-white"></div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-block mb-6 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full border border-white/30">
            <p className="text-sm font-semibold">Welcome to the future of group travel</p>
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-bold leading-tight mb-6">
            Plan trips your whole group will love
          </h1>
          <p className="text-xl sm:text-2xl text-blue-50 mb-10 max-w-3xl mx-auto leading-relaxed">
            AI-powered itineraries that keep everyone happy. Split expenses, vote on activities, and explore together—all in one beautiful platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-sky-700 font-display font-bold rounded-xl hover:bg-blue-50 transition-all duration-200 shadow-lg hover:shadow-xl text-lg"
            >
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <button className="inline-flex items-center justify-center px-8 py-4 border-2 border-white text-white font-display font-bold rounded-xl hover:bg-white/10 transition-all duration-200 text-lg">
              See How It Works
            </button>
          </div>
          <p className="text-blue-100 text-sm mt-8">No credit card required • Start planning in 2 minutes</p>
        </div>
      </section>

      {/* Feature Cards Section */}
      <section className="py-20 sm:py-28 bg-gradient-subtle">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">Everything you need for group travel</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              From planning to memories, triphive keeps your group aligned and excited
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* AI Itinerary Engine */}
            <div className="card p-8 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-sky-100 flex items-center justify-center mb-6">
                <Sparkles className="w-6 h-6 text-sky-700" />
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mb-3">
                AI Itinerary Engine
              </h3>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Our AI analyzes your group's interests and creates personalized itineraries with multiple activity tracks so everyone enjoys their trip.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Smart activity recommendations</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Multiple tracks for different interests</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Real-time price & availability updates</span>
                </li>
              </ul>
            </div>

            {/* Group Planning */}
            <div className="card p-8 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center mb-6">
                <Users className="w-6 h-6 text-stone-700" />
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mb-3">
                Group Planning Tools
              </h3>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Vote on activities, manage decisions, split expenses, and communicate with your group seamlessly in one place.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Activity voting system</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Expense splitting & settlements</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Group chat & collaboration</span>
                </li>
              </ul>
            </div>

            {/* Full Trip Lifecycle */}
            <div className="card p-8 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-sky-100 flex items-center justify-center mb-6">
                <MapPin className="w-6 h-6 text-sky-700" />
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mb-3">
                Full Trip Lifecycle
              </h3>
              <p className="text-slate-600 mb-6 leading-relaxed">
                From dreaming and planning through to packing checklists, travel guides, and shared photo memories—we've got you covered.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Pre-trip preparation tracking</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Shared photo gallery</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Travel guides & tips</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">How it works</h2>
            <p className="text-lg text-slate-600">Three simple steps to your perfect group trip</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-display font-bold text-sky-700">1</span>
              </div>
              <div className="w-12 h-12 rounded-lg bg-sky-100 flex items-center justify-center mx-auto mb-6">
                <Globe className="w-6 h-6 text-sky-700" />
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mb-3">
                Create Your Trip
              </h3>
              <p className="text-slate-600">
                Tell us where you're going, when, and who's invited. Add your group's interests and travel style.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-display font-bold text-stone-700">2</span>
              </div>
              <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center mx-auto mb-6">
                <Zap className="w-6 h-6 text-stone-700" />
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mb-3">
                Get AI Itineraries
              </h3>
              <p className="text-slate-600">
                Our AI generates personalized itineraries with activity options. Your group votes and customizes each day.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-display font-bold text-sky-700">3</span>
              </div>
              <div className="w-12 h-12 rounded-lg bg-sky-100 flex items-center justify-center mx-auto mb-6">
                <Star className="w-6 h-6 text-sky-700" />
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mb-3">
                Plan & Enjoy
              </h3>
              <p className="text-slate-600">
                Manage logistics, split expenses, stay synced, and enjoy your trip knowing everything is organized.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-20 sm:py-28 bg-gradient-subtle border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">Trusted by travelers worldwide</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            {/* Stat 1 */}
            <div className="card p-8 text-center hover:shadow-md transition-shadow">
              <div className="text-4xl sm:text-5xl font-display font-bold text-sky-700 mb-2">
                50K+
              </div>
              <p className="text-slate-600 font-medium">Trips Planned</p>
              <p className="text-slate-500 text-sm mt-2">and counting every day</p>
            </div>

            {/* Stat 2 */}
            <div className="card p-8 text-center hover:shadow-md transition-shadow">
              <div className="text-4xl sm:text-5xl font-display font-bold text-stone-700 mb-2">
                200K+
              </div>
              <p className="text-slate-600 font-medium">Happy Travelers</p>
              <p className="text-slate-500 text-sm mt-2">loving group travel</p>
            </div>

            {/* Stat 3 */}
            <div className="card p-8 text-center hover:shadow-md transition-shadow">
              <div className="flex items-center justify-center gap-1 mb-3">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-sky-600 text-sky-600" />
                ))}
              </div>
              <div className="text-3xl sm:text-4xl font-display font-bold text-slate-900 mb-2">
                4.9
              </div>
              <p className="text-slate-600 font-medium">App Rating</p>
              <p className="text-slate-500 text-sm mt-2">from 8,000+ reviews</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">Simple, transparent pricing</h2>
            <p className="text-lg text-slate-600">Choose the plan that fits your travel style</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Tier */}
            <div className="card p-8 flex flex-col hover:shadow-lg transition-all duration-300">
              <h3 className="text-2xl font-display font-bold text-slate-900 mb-2">Free</h3>
              <p className="text-slate-600 mb-6">Perfect for casual travelers</p>
              <div className="mb-6">
                <span className="text-4xl font-display font-bold text-slate-900">$0</span>
                <span className="text-slate-600 ml-2">/ month</span>
              </div>
              <Link
                href="/auth/signup"
                className="btn-outline w-full text-center mb-8"
              >
                Get Started
              </Link>
              <ul className="space-y-3 flex-1">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">1 trip at a time</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Up to 5 travelers</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Basic AI itinerary</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Activity voting (via guest link)</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Community support</span>
                </li>
              </ul>
            </div>

            {/* Explorer Tier (Most Popular) */}
            <div className="card p-8 flex flex-col relative hover:shadow-xl transition-all duration-300 border-2 border-sky-600 md:scale-105">
              <div className="badge-blue absolute -top-4 left-1/2 -translate-x-1/2">
                Most Popular
              </div>
              <h3 className="text-2xl font-display font-bold text-slate-900 mb-2">Explorer</h3>
              <p className="text-slate-600 mb-6">For adventurous groups</p>
              <div className="mb-6">
                <span className="text-4xl font-display font-bold text-slate-900">$7.99</span>
                <span className="text-slate-600 ml-2">/ month</span>
              </div>
              <button className="btn-primary w-full mb-8">
                Start Free Trial
              </button>
              <ul className="space-y-3 flex-1">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">5 trips at a time</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Up to 10 travelers</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Advanced AI itinerary</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Expense splitting & group chat</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Photo gallery & shared albums</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Local insider mode</span>
                </li>
              </ul>
            </div>

            {/* Nomad Tier (Best Value) */}
            <div className="card p-8 flex flex-col hover:shadow-lg transition-all duration-300 relative">
              <div className="badge-green absolute -top-4 left-1/2 -translate-x-1/2">
                Best Value
              </div>
              <h3 className="text-2xl font-display font-bold text-slate-900 mb-2">Nomad</h3>
              <p className="text-slate-600 mb-6">For serious travelers</p>
              <div className="mb-6">
                <span className="text-4xl font-display font-bold text-slate-900">$14.99</span>
                <span className="text-slate-600 ml-2">/ month</span>
              </div>
              <button className="btn-secondary w-full mb-8">
                Start Free Trial
              </button>
              <ul className="space-y-3 flex-1">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Unlimited trips</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Unlimited travelers</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Premium AI (faster)</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Flight price alerts</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Offline maps</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Trip narrative generation</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-stone-700 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700">Travel agent marketplace</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-28 bg-gradient-to-r from-sky-800 to-green-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-display font-bold mb-6">
            Ready to plan your next adventure?
          </h2>
          <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
            Join thousands of travelers who are using triphive to make group trips amazing.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center justify-center px-8 py-4 bg-white text-sky-700 font-display font-bold rounded-xl hover:bg-blue-50 transition-all duration-200 shadow-lg hover:shadow-xl text-lg"
          >
            Get Started Free Today
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h4 className="text-white font-display font-bold mb-4">Product</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition">Features</a></li>
                <li><a href="#" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition">How It Works</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-display font-bold mb-4">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition">About</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
                <li><a href="#" className="hover:text-white transition">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-display font-bold mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition">Terms</a></li>
                <li><a href="#" className="hover:text-white transition">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-display font-bold mb-4">Connect</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition">Twitter</a></li>
                <li><a href="#" className="hover:text-white transition">Instagram</a></li>
                <li><a href="#" className="hover:text-white transition">Email</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between">
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
              <div className="w-6 h-6 rounded-lg bg-sky-800 flex items-center justify-center">
                <Globe className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-display font-bold">triphive</span>
            </div>
            <p className="text-sm">© 2026 triphive, Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
