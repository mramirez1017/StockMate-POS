package com.stockmate.pos

import android.app.Application
import com.google.firebase.FirebaseApp

class StockMateApp : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
    }
}
