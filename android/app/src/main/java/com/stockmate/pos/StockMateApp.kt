package com.stockmate.pos

import android.app.Application
import com.google.firebase.FirebaseApp

class StockMateApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(this)
        }
    }
}
