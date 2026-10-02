'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Formatos lidos pela câmera: códigos de barras 1D comuns e QR. */
const FORMATOS = [
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'ean_13',
  'ean_8',
  'itf',
  'upc_a',
  'upc_e',
  'qr_code',
] as const;

/** O motor de leitura sai do próprio app; a rede interna pode não ter saída para CDN. */
const CAMINHO_WASM = '/zxing/zxing_reader.wasm';

const semAssinatura = () => () => {};

/** Câmera só existe em contexto seguro (HTTPS ou localhost) e com `mediaDevices`. */
function useCameraDisponivel(): boolean | null {
  return useSyncExternalStore(
    semAssinatura,
    () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia,
    () => null,
  );
}

/**
 * Leitura de etiqueta pela câmera (spec 0011, AC-11), usada em `/ativos/ler`
 * e na tela de campo da vistoria (spec 0012, AC-4). `disponivel` é `false`
 * fora de contexto seguro e `null` no servidor. Ao ler um código, a câmera
 * para sozinha e chama `aoLer` com o texto bruto.
 */
export function useLeitorCamera(aoLer: (valor: string) => void) {
  const disponivel = useCameraDisponivel();
  const [lendo, setLendo] = useState(false);
  // Entre o clique e a câmera abrir, o navegador pode estar pedindo permissão:
  // um segundo clique nesse meio abriria outro stream, que nunca seria parado.
  const [abrindo, setAbrindo] = useState(false);
  const abrindoRef = useRef(false);
  const [erro, setErro] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const aoLerRef = useRef(aoLer);

  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);

  function parar() {
    if (loopRef.current !== null) window.clearTimeout(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLendo(false);
  }

  useEffect(() => parar, []);

  async function iniciar() {
    if (abrindoRef.current || streamRef.current) return;
    abrindoRef.current = true;
    setAbrindo(true);
    setErro(null);
    try {
      const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
      prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith('.wasm') ? CAMINHO_WASM : prefix + path,
        },
      });
      const detector = new BarcodeDetector({ formats: [...FORMATOS] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setLendo(true);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const ler = async () => {
        if (!streamRef.current) return;
        try {
          const achados = await detector.detect(video);
          const valor = achados.find((a) => a.rawValue.trim())?.rawValue;
          if (valor) {
            parar();
            aoLerRef.current(valor);
            return;
          }
        } catch {
          // quadro ainda sem imagem: tenta no próximo
        }
        loopRef.current = window.setTimeout(ler, 250);
      };
      void ler();
    } catch (e) {
      parar();
      const negado = e instanceof DOMException && e.name === 'NotAllowedError';
      setErro(
        negado
          ? 'O navegador não liberou a câmera. Libere o acesso nas permissões do site ou digite o código.'
          : 'Não foi possível abrir a câmera. Digite o código ou use o leitor USB.',
      );
    } finally {
      abrindoRef.current = false;
      setAbrindo(false);
    }
  }

  return { disponivel, lendo, abrindo, erro, videoRef, iniciar, parar };
}
