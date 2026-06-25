import React, { useState } from 'react'
import { X } from 'lucide-react'

export default function Modal({ isOpen, title, onClose, children, onSubmit, loading = false }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg border border-gray-700 bg-gray-800 shadow-xl sm:max-h-[90vh] sm:rounded-lg">
        <div className="flex items-center justify-between gap-4 border-b border-gray-700 p-4 sm:p-6 sm:pb-4">
          <h2 className="min-w-0 truncate text-lg font-bold text-white sm:text-xl">{title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-700 p-4 sm:flex-row sm:p-6 sm:pt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
