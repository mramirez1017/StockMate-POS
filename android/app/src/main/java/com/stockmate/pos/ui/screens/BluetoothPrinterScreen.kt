package com.stockmate.pos.ui.screens

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.stockmate.pos.ui.components.StockMateBottomBar
import com.stockmate.pos.ui.components.StockMatePrimaryButton
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar

@Composable
fun BluetoothPrinterScreen(
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var selectedDevice by remember { mutableStateOf<BluetoothDevice?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var pairedDevices by remember { mutableStateOf<List<BluetoothDevice>>(emptyList()) }

    val bluetoothAdapter = remember { BluetoothAdapter.getDefaultAdapter() }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        if (grants.values.all { it }) {
            pairedDevices = bluetoothAdapter?.bondedDevices?.toList() ?: emptyList()
        } else {
            statusMessage = "Bluetooth permissions required"
        }
    }

    fun loadDevices() {
        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
        } else {
            arrayOf(Manifest.permission.BLUETOOTH, Manifest.permission.BLUETOOTH_ADMIN)
        }
        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        } else {
            pairedDevices = bluetoothAdapter?.bondedDevices?.toList() ?: emptyList()
            if (pairedDevices.isEmpty()) statusMessage = "No paired Bluetooth devices found"
        }
    }

    LaunchedEffect(Unit) { loadDevices() }

    StockMateScaffold(
        topBar = { StockMateTopBar(title = "Bluetooth Printer", onBack = onBack) },
        bottomBar = {
            StockMateBottomBar {
                StockMatePrimaryButton(
                    text = "Test Print",
                    onClick = {
                        statusMessage = selectedDevice?.let {
                            "Test print sent to ${it.name} (integrate ESC/POS SDK)"
                        } ?: "Select a printer first"
                    },
                    enabled = selectedDevice != null,
                )
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
        ) {
            if (bluetoothAdapter == null) {
                Text("Bluetooth not available on this device")
                return@Column
            }
            if (!bluetoothAdapter.isEnabled) {
                Text("Please enable Bluetooth in system settings")
            }
            statusMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(bottom = 8.dp))
            }
            Text("Paired devices:", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(pairedDevices, key = { it.address }) { device ->
                    val selected = selectedDevice?.address == device.address
                    ListItem(
                        headlineContent = { Text(device.name ?: "Unknown") },
                        supportingContent = { Text(device.address) },
                        modifier = Modifier.clickable { selectedDevice = device },
                        colors = ListItemDefaults.colors(
                            containerColor = if (selected) {
                                MaterialTheme.colorScheme.primaryContainer
                            } else {
                                MaterialTheme.colorScheme.surface
                            },
                        ),
                    )
                    HorizontalDivider()
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedButton(onClick = ::loadDevices, modifier = Modifier.fillMaxWidth()) {
                Text("Refresh Devices")
            }
            Text(
                text = "Integrate ESC/POS library for sales receipts, delivery receipts, and barcode labels.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 16.dp),
            )
        }
    }
}
