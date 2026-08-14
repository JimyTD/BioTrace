package app.biotrace.mobile;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
  }

  @Override
  public void onStart() {
    super.onStart();
    if (getBridge() == null) return;
    WebView webView = getBridge().getWebView();
    if (webView == null) return;
    webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    WebSettings settings = webView.getSettings();
    settings.setOffscreenPreRaster(true);
    boolean cleared = getPreferences(MODE_PRIVATE).getBoolean("cutk_webview_cleared", false);
    if (!cleared) {
      webView.clearCache(true);
      getPreferences(MODE_PRIVATE).edit().putBoolean("cutk_webview_cleared", true).apply();
    }
  }
}
