package supertonic.util;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * Utility class for downloading TTS models from Hugging Face
 */
public final class ModelDownloader {
    
    private static final String HF_BASE_URL = "https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main";
    private static final String DEFAULT_CACHE_DIR = ".cache/onnx-community/Supertonic-TTS-2-ONNX";
    
    // Required model files
    private static final String[] MODEL_FILES = {
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "onnx/text_encoder.onnx",
        "onnx/text_encoder.onnx_data",
        "onnx/latent_denoiser.onnx",
        "onnx/latent_denoiser.onnx_data",
        "onnx/voice_decoder.onnx",
        "onnx/voice_decoder.onnx_data"
    };
    
    private ModelDownloader() {} // Prevent instantiation
    
    /**
     * Get the default cache directory path
     */
    public static String getDefaultCacheDir() {
        return DEFAULT_CACHE_DIR;
    }
    
    /**
     * Check if all required model files exist in the cache directory
     */
    public static boolean modelsExist(String cacheDir) {
        Path basePath = Paths.get(cacheDir);
        for (String file : MODEL_FILES) {
            if (!Files.exists(basePath.resolve(file))) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * Download all required model files if they don't exist
     */
    public static String ensureModelsExist(String customCacheDir) throws IOException {
        String cacheDir = customCacheDir != null ? customCacheDir : DEFAULT_CACHE_DIR;
        
        if (modelsExist(cacheDir)) {
            System.out.println("All model files found in: " + cacheDir);
            return cacheDir;
        }
        
        System.out.println("Downloading model files to: " + cacheDir);
        downloadAllModels(cacheDir);
        System.out.println("Model download complete!\n");
        
        return cacheDir;
    }
    
    /**
     * Download all required model files
     */
    private static void downloadAllModels(String cacheDir) throws IOException {
        List<String> failed = new ArrayList<>();
        
        for (String file : MODEL_FILES) {
            try {
                downloadFile(file, cacheDir);
            } catch (IOException e) {
                failed.add(file);
                System.err.println("Failed to download: " + file + " - " + e.getMessage());
            }
        }
        
        if (!failed.isEmpty()) {
            throw new IOException("Failed to download files: " + String.join(", ", failed));
        }
    }
    
    /**
     * Download a single file from Hugging Face
     */
    private static void downloadFile(String relativePath, String cacheDir) throws IOException {
        Path targetPath = Paths.get(cacheDir, relativePath);
        
        // Create parent directories if needed
        Files.createDirectories(targetPath.getParent());
        
        String downloadUrl = HF_BASE_URL + "/" + relativePath;
        System.out.println("Downloading: " + relativePath + "...");
        
        HttpURLConnection connection = null;
        InputStream inputStream = null;
        
        try {
            URL url = new URL(downloadUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(300000); // 5 minutes for large files
            
            int responseCode = connection.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK) {
                throw new IOException("HTTP " + responseCode + " for " + downloadUrl);
            }
            
            inputStream = connection.getInputStream();
            long fileSize = connection.getContentLengthLong();
            
            // Download with progress
            try (OutputStream outputStream = Files.newOutputStream(targetPath)) {
                byte[] buffer = new byte[8192];
                long totalRead = 0;
                int bytesRead;
                
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                    totalRead += bytesRead;
                    
                    // Show progress for large files
                    if (fileSize > 0 && fileSize > 1_000_000) {
                        int progress = (int) ((totalRead * 100) / fileSize);
                        System.out.print("\rDownloading: " + relativePath + " (" + progress + "%)");
                    }
                }
                
                if (fileSize > 0 && fileSize > 1_000_000) {
                    System.out.println("\rDownloaded: " + relativePath + " (100%)");
                }
            }
            
        } finally {
            if (inputStream != null) {
                try { inputStream.close(); } catch (IOException ignored) {}
            }
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
    
    /**
     * Get the path to the ONNX models directory
     */
    public static String getOnnxDir(String cacheDir) {
        return Paths.get(cacheDir, "onnx").toString();
    }
    
    /**
     * Get the path to the tokenizer file
     */
    public static String getTokenizerPath(String cacheDir) {
        return Paths.get(cacheDir, "tokenizer.json").toString();
    }
    
    /**
     * Get the path to the config file
     */
    public static String getConfigPath(String cacheDir) {
        return Paths.get(cacheDir, "config.json").toString();
    }
}
