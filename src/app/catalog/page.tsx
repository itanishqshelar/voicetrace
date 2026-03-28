'use client';

import { useEffect, useState, FormEvent, useRef } from 'react';
import Link from 'next/link';
import { PackageSearch, Plus, Edit, Trash2, ArrowLeft, Loader2, Mic, Square } from 'lucide-react';

interface CatalogItem {
  id: string;
  name: string;
  price_per_unit: number;
  unit: string;
  category: string;
  aliases: string[];
}

export default function CatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Voice State
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    price_per_unit: '',
    unit: 'piece',
    category: 'sale',
    aliases: '',
  });

  const fetchCatalog = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/catalog');
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Fetch catalog error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({ name: '', price_per_unit: '', unit: 'piece', category: 'sale', aliases: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (item: CatalogItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      price_per_unit: item.price_per_unit.toString(),
      unit: item.unit,
      category: item.category,
      aliases: item.aliases ? item.aliases.join(', ') : '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    if (isRecording) stopRecording();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await handleVoiceUpload(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleVoiceUpload = async (audioBlob: Blob) => {
    setIsExtracting(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);

      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!transcribeRes.ok) throw new Error('Transcription failed');
      const { text } = await transcribeRes.json();

      if (!text) throw new Error('No text transcribed');

      const extractRes = await fetch('/api/catalog/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!extractRes.ok) throw new Error('Extraction failed');
      const extractedItem = await extractRes.json();

      setFormData(prev => ({
        ...prev,
        name: extractedItem.name || prev.name,
        price_per_unit: extractedItem.price_per_unit !== undefined ? extractedItem.price_per_unit.toString() : prev.price_per_unit,
        unit: extractedItem.unit || prev.unit,
        category: extractedItem.category || prev.category,
        aliases: extractedItem.aliases && extractedItem.aliases.length > 0 ? extractedItem.aliases.join(', ') : prev.aliases,
      }));

    } catch (err) {
      console.error('Voice extraction error:', err);
      alert('Failed to process voice input. Please try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        name: formData.name,
        price_per_unit: Number(formData.price_per_unit),
        unit: formData.unit,
        category: formData.category,
        aliases: formData.aliases.split(',').map((s) => s.trim()).filter(Boolean),
      };

      if (editingItem) {
        // Edit
        const res = await fetch('/api/catalog', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingItem.id, ...payload }),
        });
        if (res.ok) {
          const { item } = await res.json();
          setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
        }
      } else {
        // Add
        const res = await fetch('/api/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const { item } = await res.json();
          setItems((prev) => [...prev, item]);
        }
      }
      closeModal();
    } catch (err) {
      console.error('Save item error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      setItems((prev) => prev.filter((i) => i.id !== id));
      await fetch(`/api/catalog?id=${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete item error:', err);
    }
  };

  const saleItems = items.filter((i) => i.category === 'sale');
  const expenseItems = items.filter((i) => i.category === 'expense');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="w-full px-4 sm:px-8 py-4 flex items-center justify-between border-b border-border bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <h1 className="text-xl font-bold text-text-primary">Product Catalog</h1>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary-dark transition-colors shadow-sm shadow-primary/30"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-8 py-6 pb-24">
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in-up">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
              <p className="text-text-muted">Loading catalog...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6">
                <PackageSearch className="w-10 h-10 text-indigo-500" />
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">Your Catalog is Empty</h3>
              <p className="text-text-muted max-w-sm mb-6">Add your products with their typical prices so VoiceTrace can analyze your voice notes accurately.</p>
              <button
                onClick={openAddModal}
                className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors shadow-md shadow-primary/30"
              >
                Add Your First Item
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {saleItems.map((item) => (
                  <div key={item.id} className="card p-4 flex items-center justify-between group hover:border-emerald-200 transition-all shadow-sm">
                    <div>
                      <p className="font-bold text-slate-800 text-lg">{item.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md text-sm">
                          ₹{item.price_per_unit} / {item.unit}
                        </span>
                        {item.aliases.length > 0 && (
                          <span className="text-xs text-slate-400 capitalize truncate max-w-[150px]">
                            {item.aliases.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditModal(item)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800 flex flex-col sm:flex-row sm:items-center gap-3">
                {editingItem ? 'Edit Item' : 'Add New Item'}
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isExtracting}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shadow-sm ${
                    isRecording 
                      ? 'bg-red-500 text-white animate-pulse shadow-red-500/30' 
                      : isExtracting
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100'
                  }`}
                >
                  {isExtracting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...</>
                  ) : isRecording ? (
                    <><Square className="w-3.5 h-3.5 fill-current" /> Stop Setup</>
                  ) : (
                    <><Mic className="w-3.5 h-3.5" /> Speak to Auto-fill</>
                  )}
                </button>
              </h3>
              <button onClick={closeModal} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <Trash2 className="w-4 h-4 opacity-0" /> {/* Spacer */}
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 text-left">Item Name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Samosa, Chai, Petrol"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-800"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 text-left">Price (₹)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    placeholder="e.g. 20"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-800"
                    value={formData.price_per_unit}
                    onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 text-left">Unit</label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white text-slate-800"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  >
                    <option value="piece">Piece</option>
                    <option value="plate">Plate</option>
                    <option value="glass">Glass</option>
                    <option value="cup">Cup</option>
                    <option value="kg">Kg</option>
                    <option value="litre">Litre</option>
                    <option value="pack">Pack</option>
                  </select>
                </div>
              </div>



              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 text-left">Aliases / Other Names</label>
                <input
                  type="text"
                  placeholder="e.g. sabzi, bhaji (comma separated)"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-800 text-sm"
                  value={formData.aliases}
                  onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                />
                <p className="text-[11px] text-slate-400 mt-1">Helps AI understand different words for the same item.</p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2.5 rounded-xl font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center justify-center min-w-[100px] px-5 py-2.5 rounded-xl font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-70 disabled:cursor-not-allowed transition-colors shadow-sm shadow-primary/30"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
